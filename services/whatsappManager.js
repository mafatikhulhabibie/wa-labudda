import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pino from 'pino';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { delay } from '../utils/delay.js';
import { randomDelayMs } from '../utils/randomDelay.js';
import { assertValidSessionId } from '../utils/sessionId.js';
import { toWhatsAppJid } from '../utils/phoneFormat.js';
import { InMemoryJobQueue } from './queue/inMemoryJobQueue.js';
import { broadcastInbox } from './inboxSocket.js';
import { summarizeMessagesUpsert } from '../utils/waUpsertSummary.js';
import { dispatchDeviceWebhook } from './webhookDispatcher.js';

const waLogger = pino({ level: 'silent' });

/**
 * @typedef {'connecting' | 'connected' | 'disconnected'} ApiConnectionStatus
 */

class ManagedSession {
  /**
   * @param {string} sessionId
   * @param {WhatsAppManager} manager
   */
  constructor(sessionId, manager) {
    this.sessionId = sessionId;
    /** @type {WhatsAppManager} */
    this.manager = manager;
    /** @type {import('@whiskeysockets/baileys').WASocket | null} */
    this.sock = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._reconnectTimer = null;
    this._startPromise = null;
    this.intentionalStop = false;
    this._loggedOut = false;
    /** @type {ApiConnectionStatus} */
    this.apiStatus = 'disconnected';
    this.sendQueue = new InMemoryJobQueue();
    /** @type {string | null} */
    this.lastDisconnectReason = null;
  }

  get cfg() {
    return getConfig();
  }

  get authDir() {
    return join(this.cfg.sessionsRoot, this.sessionId);
  }

  get qrPath() {
    return join(this.cfg.qrDir, `${this.sessionId}.png`);
  }

  toPublicStatus() {
    return {
      session_id: this.sessionId,
      status: this.apiStatus,
    };
  }

  async start() {
    if (this.sock?.user && this.apiStatus === 'connected') {
      return;
    }

    if (this._startPromise) {
      return this._startPromise;
    }

    this.intentionalStop = false;
    this._startPromise = this._bootstrap().finally(() => {
      this._startPromise = null;
    });

    return this._startPromise;
  }

  async _disposeSocket() {
    if (!this.sock) {
      return;
    }

    try {
      this.sock.ev.removeAllListeners('creds.update');
      this.sock.ev.removeAllListeners('connection.update');
      this.sock.ev.removeAllListeners('messages.upsert');
    } catch {
      // ignore
    }

    try {
      this.sock.end(undefined);
    } catch {
      // ignore
    }

    this.sock = null;
  }

  async _bootstrap() {
    await mkdir(this.authDir, { recursive: true });
    await mkdir(dirname(this.qrPath), { recursive: true });
    await mkdir(this.cfg.qrDir, { recursive: true });

    await this._disposeSocket();

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.apiStatus = 'connecting';
    logger.info({ sessionId: this.sessionId }, 'whatsapp session connecting');

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: waLogger,
      browser: ['wa-gateway', 'Chrome', this.sessionId],
      markOnlineOnConnect: true,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        await QRCode.toFile(this.qrPath, qr, { type: 'png', margin: 2, width: 512 });
        logger.info({ sessionId: this.sessionId, path: this.qrPath }, 'session qr written');
        if (this.apiStatus !== 'connected') {
          this.apiStatus = 'connecting';
        }
      }

      if (connection === 'connecting') {
        this.apiStatus = 'connecting';
        logger.info({ sessionId: this.sessionId }, 'whatsapp socket connecting');
      }

      if (connection === 'open') {
        this._loggedOut = false;
        this.apiStatus = 'connected';
        this.lastDisconnectReason = null;
        logger.info(
          { sessionId: this.sessionId, userId: this.sock?.user?.id },
          'whatsapp session open',
        );
      }

      if (connection === 'close') {
        const boomStatus = lastDisconnect?.error?.output?.statusCode;
        this.lastDisconnectReason = String(
          boomStatus ?? lastDisconnect?.error?.message ?? 'unknown',
        );

        const loggedOut = boomStatus === DisconnectReason.loggedOut;
        logger.warn(
          {
            sessionId: this.sessionId,
            boomStatus,
            loggedOut,
            reason: this.lastDisconnectReason,
          },
          'whatsapp session closed',
        );

        this.apiStatus = 'disconnected';

        if (this.intentionalStop) {
          logger.info({ sessionId: this.sessionId }, 'reconnect skipped (intentional stop)');
          return;
        }

        if (loggedOut) {
          this._loggedOut = true;
          logger.error({ sessionId: this.sessionId }, 'whatsapp logged out');
          return;
        }

        logger.info({ sessionId: this.sessionId }, 'whatsapp scheduling reconnect');
        this._scheduleReconnect();
      }
    });

    this.sock.ev.on('messages.upsert', async (payload) => {
      if (this.cfg.webhookIncomingMessageUrl) {
        try {
          await this.manager._dispatchIncomingWebhook(
            this.sessionId,
            this.cfg.webhookIncomingMessageUrl,
            payload,
          );
        } catch (err) {
          logger.warn({ err, sessionId: this.sessionId }, 'incoming webhook handler failed');
        }
      }
      await dispatchDeviceWebhook(this.sessionId, 'message.incoming', {
        type: payload.type,
        messages: payload.messages?.map((m) => ({
          id: m.key?.id,
          remoteJid: m.key?.remoteJid,
          fromMe: m.key?.fromMe,
          messageTimestamp: m.messageTimestamp,
        })),
      }).catch(() => {});
      try {
        await this.manager._relayUiIncoming(this.sessionId, payload);
      } catch (err) {
        logger.warn({ err, sessionId: this.sessionId }, 'ui inbox relay failed');
      }
    });
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) {
      return;
    }

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      logger.info({ sessionId: this.sessionId }, 'whatsapp reconnecting');
      void this.start().catch((err) => {
        logger.error({ err, sessionId: this.sessionId }, 'whatsapp reconnect failed');
      });
    }, 2500);
  }

  async stop() {
    this.intentionalStop = true;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    await this._disposeSocket();
    this.apiStatus = 'disconnected';
    logger.info({ sessionId: this.sessionId }, 'whatsapp session stopped');
  }

  /**
   * @param {string} jid
   * @param {import('@whiskeysockets/baileys').AnyMessageContent} content
   */
  async sendMessageContent(jid, content) {
    const cfg = this.cfg;

    if (this.apiStatus !== 'connected' || !this.sock?.user) {
      throw Object.assign(new Error('Session is not connected'), { status: 503, expose: true });
    }

    const waitMs = randomDelayMs(cfg.sendDelayMinMs, cfg.sendDelayMaxMs);
    await delay(waitMs);

    let lastErr;
    const maxAttempts = cfg.sendMaxAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (this.apiStatus !== 'connected' || !this.sock?.user) {
        throw Object.assign(new Error('Session disconnected while sending'), {
          status: 503,
          expose: true,
        });
      }

      try {
        const result = await this.sock.sendMessage(jid, content);
        logger.info({ sessionId: this.sessionId, jid, attempt }, 'whatsapp message sent');
        return result;
      } catch (err) {
        lastErr = err;
        logger.warn(
          { err, sessionId: this.sessionId, jid, attempt, maxAttempts },
          'whatsapp send failed',
        );

        if (attempt < maxAttempts) {
          await delay(cfg.sendRetryBackoffMs * attempt);
        }
      }
    }

    throw Object.assign(new Error(lastErr?.message || 'Failed to send message'), {
      status: 502,
      expose: true,
      cause: lastErr,
    });
  }

  /**
   * @param {string} jid
   * @param {string} text
   */
  async sendText(jid, text) {
    return this.sendMessageContent(jid, { text });
  }
}

export class WhatsAppManager {
  constructor() {
    /** @type {Map<string, ManagedSession>} */
    this.sessions = new Map();
  }

  get cfg() {
    return getConfig();
  }

  /**
   * @param {unknown} sessionIdRaw
   */
  getSessionOrThrow(sessionIdRaw) {
    const sessionId = assertValidSessionId(sessionIdRaw);
    const sess = this.sessions.get(sessionId);
    if (!sess) {
      throw Object.assign(new Error('Session not found'), { status: 404, expose: true });
    }

    return sess;
  }

  /**
   * @param {unknown} sessionIdRaw
   */
  isSessionLoaded(sessionIdRaw) {
    const sessionId = assertValidSessionId(sessionIdRaw);
    return this.sessions.has(sessionId);
  }

  /**
   * Runtime status without throwing when the socket is not loaded in memory.
   * @param {unknown} sessionIdRaw
   */
  getPublicStatusIfLoaded(sessionIdRaw) {
    const sessionId = assertValidSessionId(sessionIdRaw);
    const sess = this.sessions.get(sessionId);
    if (sess) {
      return sess.toPublicStatus();
    }
    return { session_id: sessionId, status: 'disconnected' };
  }

  /**
   * @param {unknown} sessionIdRaw
   */
  async createSession(sessionIdRaw) {
    const sessionId = assertValidSessionId(sessionIdRaw);

    let sess = this.sessions.get(sessionId);
    if (!sess) {
      sess = new ManagedSession(sessionId, this);
      this.sessions.set(sessionId, sess);
      logger.info({ sessionId }, 'session created');
    } else {
      logger.info({ sessionId }, 'session create idempotent');
    }

    await sess.start();
    return sess.toPublicStatus();
  }

  /**
   * Hentikan socket Baileys di memori; folder auth & baris device di DB tetap ada.
   * @param {unknown} sessionIdRaw
   */
  async stopRuntime(sessionIdRaw) {
    const sessionId = assertValidSessionId(sessionIdRaw);
    const sess = this.sessions.get(sessionId);
    if (sess) {
      await sess.stop();
      this.sessions.delete(sessionId);
      logger.info({ sessionId }, 'whatsapp runtime stopped (session files kept)');
    }
    return { session_id: sessionId, status: 'disconnected' };
  }

  /**
   * @param {unknown} sessionIdRaw
   */
  async deleteSession(sessionIdRaw) {
    const sessionId = assertValidSessionId(sessionIdRaw);
    const sess = this.sessions.get(sessionId);

    if (sess) {
      await sess.stop();
      this.sessions.delete(sessionId);
    }

    await rm(join(this.cfg.sessionsRoot, sessionId), { recursive: true, force: true });
    await rm(join(this.cfg.qrDir, `${sessionId}.png`), { force: true });

    logger.info({ sessionId }, 'session deleted');
    return { session_id: sessionId, deleted: true };
  }

  /**
   * @param {unknown} sessionIdRaw
   */
  getStatus(sessionIdRaw) {
    const sess = this.getSessionOrThrow(sessionIdRaw);
    return sess.toPublicStatus();
  }

  /**
   * @param {unknown} sessionIdRaw
   */
  getQrAbsolutePath(sessionIdRaw) {
    const sess = this.getSessionOrThrow(sessionIdRaw);
    return sess.qrPath;
  }

  /**
   * @param {string} sessionId
   * @param {string} webhookUrl
   * @param {import('@whiskeysockets/baileys').BaileysEventMap['messages.upsert']} payload
   */
  /**
   * @param {string} sessionId
   * @param {import('@whiskeysockets/baileys').BaileysEventMap['messages.upsert']} payload
   */
  async _relayUiIncoming(sessionId, payload) {
    const items = summarizeMessagesUpsert(sessionId, payload);
    for (const item of items) {
      broadcastInbox(sessionId, item);
    }
  }

  async _dispatchIncomingWebhook(sessionId, webhookUrl, payload) {
    const body = {
      session_id: sessionId,
      type: payload.type,
      messages: payload.messages?.map((m) => ({
        id: m.key?.id,
        remoteJid: m.key?.remoteJid,
        fromMe: m.key?.fromMe,
        messageTimestamp: m.messageTimestamp,
      })),
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logger.warn(
        { sessionId, status: res.status },
        'incoming webhook returned non-OK response',
      );
    }
  }

  /**
   * @param {unknown} sessionIdRaw
   * @param {unknown} numberRaw
   * @param {unknown} messageRaw
   */
  async sendMessage(sessionIdRaw, numberRaw, messageRaw) {
    const sessionId = assertValidSessionId(sessionIdRaw);
    const sess = this.getSessionOrThrow(sessionId);

    if (numberRaw === undefined || numberRaw === null || String(numberRaw).trim() === '') {
      throw Object.assign(new Error('number is required'), { status: 400, expose: true });
    }

    if (messageRaw === undefined || messageRaw === null || String(messageRaw).trim() === '') {
      throw Object.assign(new Error('message is required'), { status: 400, expose: true });
    }

    let jid;
    try {
      ({ jid } = toWhatsAppJid(String(numberRaw)));
    } catch {
      throw Object.assign(new Error('Invalid phone number'), { status: 400, expose: true });
    }

    const text = String(messageRaw);

    if (sess.apiStatus !== 'connected' || !sess.sock?.user) {
      throw Object.assign(new Error('Session is not connected'), { status: 503, expose: true });
    }

    return sess.sendQueue.enqueue(() => sess.sendText(jid, text));
  }

  /**
   * @param {unknown} sessionIdRaw
   * @param {unknown} numberRaw
   * @param {{
   *   kind: 'image' | 'document'
   *   buffer: Buffer
   *   mimetype: string
   *   fileName?: string
   *   caption?: string
   * }} opts
   */
  async sendMediaAttachment(sessionIdRaw, numberRaw, opts) {
    const sessionId = assertValidSessionId(sessionIdRaw);
    const sess = this.getSessionOrThrow(sessionId);

    if (numberRaw === undefined || numberRaw === null || String(numberRaw).trim() === '') {
      throw Object.assign(new Error('number is required'), { status: 400, expose: true });
    }

    const { kind, buffer, mimetype, fileName, caption } = opts;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw Object.assign(new Error('file is empty or invalid'), { status: 400, expose: true });
    }

    let jid;
    try {
      ({ jid } = toWhatsAppJid(String(numberRaw)));
    } catch {
      throw Object.assign(new Error('Invalid phone number'), { status: 400, expose: true });
    }

    if (sess.apiStatus !== 'connected' || !sess.sock?.user) {
      throw Object.assign(new Error('Session is not connected'), { status: 503, expose: true });
    }

    const cap = caption && String(caption).trim() ? String(caption).trim() : undefined;
    const mime = String(mimetype || 'application/octet-stream');
    const safeName = String(fileName || 'file')
      .replace(/[/\\]/g, '_')
      .replace(/\0/g, '')
      .slice(0, 200) || 'file';

    /** @type {import('@whiskeysockets/baileys').AnyMessageContent} */
    let content;
    if (kind === 'image') {
      if (!mime.startsWith('image/')) {
        throw Object.assign(new Error('media_type image requires an image/* file'), {
          status: 400,
          expose: true,
        });
      }
      content = { image: buffer, mimetype: mime, ...(cap ? { caption: cap } : {}) };
    } else {
      content = {
        document: buffer,
        mimetype: mime,
        fileName: safeName,
        ...(cap ? { caption: cap } : {}),
      };
    }

    return sess.sendQueue.enqueue(() => sess.sendMessageContent(jid, content));
  }

  /**
   * @param {string[]} sessionIds
   * @param {unknown} numberRaw
   * @param {unknown} messageRaw
   */
  async broadcast(sessionIds, numberRaw, messageRaw) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      throw Object.assign(new Error('session_ids must be a non-empty array'), {
        status: 400,
        expose: true,
      });
    }

    const results = [];
    for (const id of sessionIds) {
      let sid;
      try {
        sid = assertValidSessionId(id);
      } catch (err) {
        results.push({
          session_id: String(id),
          success: false,
          error: err.message || 'Invalid session_id',
          status: err.status || 400,
        });
        continue;
      }

      try {
        await this.sendMessage(sid, numberRaw, messageRaw);
        results.push({ session_id: sid, success: true });
      } catch (err) {
        const status = err.status || 500;
        results.push({
          session_id: sid,
          success: false,
          error: err.message || 'error',
          status,
        });
      }
    }

    return { results };
  }

  async stopAll() {
    const ids = [...this.sessions.keys()];
    await Promise.all(
      ids.map(async (id) => {
        const s = this.sessions.get(id);
        if (s) {
          await s.stop();
        }
      }),
    );
    this.sessions.clear();
    logger.info('all whatsapp sessions stopped');
  }
}

export const whatsappManager = new WhatsAppManager();
