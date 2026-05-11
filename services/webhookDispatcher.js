import { getWebhookBySessionId } from '../repositories/deviceWebhookRepository.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function toDigitsOrNull(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const left = raw.split(':')[0] || '';
  const noDomain = left.split('@')[0] || '';
  const digits = noDomain.replace(/\D/g, '');
  return digits || null;
}

/** Root fields ala Fonnte / CodeIgniter: selalu string agar aman untuk `$data['sender']` dll. */
function fonnteRootStr(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * @param {string} event
 * @param {string} sessionId
 * @param {any} data
 * @param {{ normalizeSenderDigits: boolean }} opts
 */
function buildFonnteLikePayload(event, sessionId, data, opts) {
  const prim = data?.primary || null;
  const firstIncoming = data?.summary?.[0] || null;
  const firstMessage = Array.isArray(data?.messages) ? (data.messages[0] ?? null) : null;
  const rawSender =
    prim?.participant ||
    prim?.remote_jid ||
    (firstIncoming?.from_me
      ? null
      : firstMessage?.participant ||
        firstIncoming?.participant_jid ||
        firstIncoming?.chat_jid ||
        firstMessage?.remoteJid ||
        data?.chat_jid ||
        data?.number ||
        data?.sender ||
        null);
  const sender = opts.normalizeSenderDigits ? toDigitsOrNull(rawSender) : rawSender;
  const name = prim?.push_name || firstMessage?.pushName || data?.name || '';
  const message =
    prim?.text || firstIncoming?.text || firstMessage?.text || data?.message || data?.text || '';
  const url = firstMessage?.url || data?.url || '';
  const filename = firstMessage?.filename || data?.filename || '';
  const mimetype = String(firstMessage?.mimetype || data?.mimetype || '');
  const extension =
    data?.extension || (mimetype.includes('/') ? mimetype.split('/')[1] || '' : '');
  const rawMember =
    prim?.participant ||
    firstIncoming?.participant_jid ||
    firstMessage?.participant ||
    data?.participant_jid ||
    null;
  const member = opts.normalizeSenderDigits ? toDigitsOrNull(rawMember) : rawMember;

  return {
    // Tetap mempertahankan format bawaan wa-server
    event,
    session_id: sessionId,
    sent_at: new Date().toISOString(),
    data,
    // Format mirip Fonnte (root-level fields, selalu string)
    device: fonnteRootStr(sessionId),
    sender: fonnteRootStr(sender),
    message: fonnteRootStr(message),
    member: fonnteRootStr(member),
    name: fonnteRootStr(name),
    location: fonnteRootStr(data?.location),
    url: fonnteRootStr(url),
    filename: fonnteRootStr(filename),
    extension: fonnteRootStr(extension),
  };
}

/**
 * Body JSON untuk POST webhook (per-device atau URL global).
 * @param {string} sessionId
 * @param {string} event
 * @param {unknown} data
 */
export function buildWebhookPostBody(sessionId, event, data) {
  const cfg = getConfig();
  if (cfg.webhookPayloadMode === 'fonnte') {
    return buildFonnteLikePayload(event, sessionId, data, {
      normalizeSenderDigits: cfg.webhookNormalizeSenderDigits,
    });
  }
  return {
    event,
    session_id: sessionId,
    sent_at: new Date().toISOString(),
    data,
  };
}

/**
 * Body response webhook JSON: ambil teks balasan jika ada (reply / reply_text / message string).
 * @param {string} raw
 * @param {number} maxLen
 * @returns {string | null}
 */
export function extractReplyTextFromWebhookResponse(raw, maxLen) {
  const s = String(raw || '').trim();
  if (!s || s[0] !== '{') return null;
  const slice = s.length > 65536 ? s.slice(0, 65536) : s;
  let obj;
  try {
    obj = JSON.parse(slice);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const reply = obj.reply ?? obj.reply_text ?? obj.message;
  if (typeof reply !== 'string') return null;
  const t = reply.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

/**
 * @param {string} sessionId
 * @param {string} event
 * @param {unknown} data
 * @returns {Promise<{ dispatched: boolean, reason?: string, status?: number, replyText: string | null }>}
 */
export async function dispatchDeviceWebhook(sessionId, event, data) {
  const cfg = getConfig();
  const hook = await getWebhookBySessionId(sessionId);
  if (!hook || !hook.enabled || !hook.url) {
    return { dispatched: false, reason: 'disabled_or_missing', replyText: null };
  }

  const payload = buildWebhookPostBody(sessionId, event, data);

  const res = await fetch(hook.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'wa-gateway-webhook/1.0' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  let replyText = null;
  if (res.ok && cfg.webhookReplyFromBody && event === 'message.incoming') {
    try {
      const rawBody = await res.text();
      replyText = extractReplyTextFromWebhookResponse(rawBody, cfg.webhookReplyMaxLen);
    } catch (err) {
      logger.warn({ err, sessionId, event, url: hook.url }, 'device webhook reply body read failed');
    }
  }

  if (!res.ok) {
    logger.warn(
      { sessionId, event, status: res.status, url: hook.url },
      'device webhook returned non-OK response',
    );
  }

  return { dispatched: true, status: res.status, replyText };
}
