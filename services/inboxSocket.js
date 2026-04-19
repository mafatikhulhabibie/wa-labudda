import { WebSocketServer } from 'ws';
import { getConfig } from '../config/index.js';
import { verifyUserJwt } from './authTokens.js';
import { findDeviceBySessionId } from '../repositories/deviceRepository.js';
import { assertValidSessionId } from '../utils/sessionId.js';
import { logger } from '../utils/logger.js';

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const bySession = new Map();

/** @param {import('ws').WebSocket} ws */
function removeSocket(ws) {
  const subs = ws._inboxSessions;
  if (!subs) return;
  for (const sid of subs) {
    const set = bySession.get(sid);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        bySession.delete(sid);
      }
    }
  }
  subs.clear();
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {string} sessionId
 */
function addSubscription(ws, sessionId) {
  if (!bySession.has(sessionId)) {
    bySession.set(sessionId, new Set());
  }
  bySession.get(sessionId).add(ws);
  if (!ws._inboxSessions) {
    ws._inboxSessions = new Set();
  }
  ws._inboxSessions.add(sessionId);
}

/**
 * @param {string} sessionId
 * @param {Record<string, unknown>} payloadObj
 */
export function broadcastInbox(sessionId, payloadObj) {
  const set = bySession.get(sessionId);
  if (!set?.size) {
    return;
  }
  const raw = JSON.stringify(payloadObj);
  for (const ws of set) {
    if (ws.readyState === 1) {
      try {
        ws.send(raw);
      } catch {
        removeSocket(ws);
      }
    }
  }
}

function parseCookie(header, name) {
  if (!header || !name) {
    return '';
  }
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

/** @type {WebSocketServer | null} */
let wss = null;

/**
 * @param {import('http').Server} httpServer
 */
export function attachInboxSocket(httpServer) {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    void (async () => {
      try {
        const host = req.headers.host || 'localhost';
        const url = new URL(req.url || '/', `http://${host}`);
        if (url.pathname !== '/ws/inbox') {
          return;
        }

        const cfg = getConfig();
        const token = parseCookie(req.headers.cookie || '', cfg.sessionCookieName);
        const user = await verifyUserJwt(token);
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.userId = user.id;
          ws.userRole = user.role;
          wss.emit('connection', ws, req);
        });
      } catch (err) {
        logger.warn({ err }, 'ws inbox upgrade failed');
        try {
          socket.write('HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n');
        } catch {
          /* */
        }
        socket.destroy();
      }
    })();
  });

  wss.on('connection', (ws) => {
    ws._inboxSessions = new Set();
    let subscribed = false;

    const subTimeout = setTimeout(() => {
      if (!subscribed && ws.readyState === 1) {
        ws.close(4000, 'Subscribe timeout');
      }
    }, 12_000);
    subTimeout.unref?.();

    ws.on('message', async (data, isBinary) => {
      if (isBinary) return;
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg?.type !== 'subscribe' || !Array.isArray(msg.session_ids)) {
        try {
          ws.send(JSON.stringify({ type: 'error', error: 'Kirim {type:"subscribe", session_ids:[...]}' }));
        } catch {
          /* */
        }
        return;
      }

      removeSocket(ws);

      for (const sid of msg.session_ids) {
        let sessionId;
        try {
          sessionId = assertValidSessionId(sid);
        } catch {
          continue;
        }
        const dev = await findDeviceBySessionId(sessionId);
        if (!dev) continue;
        if (Number(dev.user_id) !== ws.userId && ws.userRole !== 'admin') {
          continue;
        }
        addSubscription(ws, sessionId);
        subscribed = true;
      }

      clearTimeout(subTimeout);
      try {
        ws.send(
          JSON.stringify({
            type: 'subscribed',
            session_ids: [...(ws._inboxSessions || [])],
          }),
        );
      } catch {
        /* */
      }
    });

    ws.on('close', () => {
      clearTimeout(subTimeout);
      removeSocket(ws);
    });

    ws.on('error', () => {
      clearTimeout(subTimeout);
      removeSocket(ws);
    });

    try {
      ws.send(
        JSON.stringify({
          type: 'hello',
          message: 'Kirim {"type":"subscribe","session_ids":["session-id"]}',
        }),
      );
    } catch {
      /* */
    }
  });

  logger.info('WebSocket inbox: /ws/inbox');
}

export function closeInboxSocket() {
  if (!wss) {
    return;
  }
  try {
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close();
  } catch (err) {
    logger.warn({ err }, 'inbox socket close failed');
  }
  wss = null;
}
