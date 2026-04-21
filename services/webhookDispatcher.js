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

/**
 * @param {string} event
 * @param {string} sessionId
 * @param {any} data
 * @param {{ normalizeSenderDigits: boolean }} opts
 */
function buildFonnteLikePayload(event, sessionId, data, opts) {
  const firstIncoming = data?.summary?.[0] || null;
  const firstMessage = Array.isArray(data?.messages) ? (data.messages[0] ?? null) : null;
  const rawSender =
    firstIncoming?.from_me
      ? null
      : firstMessage?.participant ||
        firstIncoming?.participant_jid ||
        firstIncoming?.chat_jid ||
        firstMessage?.remoteJid ||
        data?.chat_jid ||
        data?.number ||
        data?.sender ||
        null;
  const sender = opts.normalizeSenderDigits ? toDigitsOrNull(rawSender) : rawSender;
  const name = firstMessage?.pushName || data?.name || '';
  const message = firstIncoming?.text || firstMessage?.text || data?.message || data?.text || '';
  const url = firstMessage?.url || data?.url || '';
  const filename = firstMessage?.filename || data?.filename || '';
  const mimetype = firstMessage?.mimetype || data?.mimetype || '';
  const extension = data?.extension || (mimetype.includes('/') ? mimetype.split('/')[1] : '');
  const rawMember =
    firstIncoming?.participant_jid || firstMessage?.participant || data?.participant_jid || null;
  const member = opts.normalizeSenderDigits ? toDigitsOrNull(rawMember) : rawMember;

  return {
    // Tetap mempertahankan format bawaan wa-server
    event,
    session_id: sessionId,
    sent_at: new Date().toISOString(),
    data,
    // Format mirip Fonnte (root-level fields)
    device: sessionId,
    sender,
    message,
    member,
    name,
    location: data?.location || '',
    url,
    filename,
    extension,
  };
}

/**
 * @param {string} sessionId
 * @param {string} event
 * @param {unknown} data
 */
export async function dispatchDeviceWebhook(sessionId, event, data) {
  const hook = await getWebhookBySessionId(sessionId);
  if (!hook || !hook.enabled || !hook.url) return { dispatched: false, reason: 'disabled_or_missing' };

  const cfg = getConfig();
  const payload =
    cfg.webhookPayloadMode === 'fonnte'
      ? buildFonnteLikePayload(event, sessionId, data, {
          normalizeSenderDigits: cfg.webhookNormalizeSenderDigits,
        })
      : {
          event,
          session_id: sessionId,
          sent_at: new Date().toISOString(),
          data,
        };

  const res = await fetch(hook.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'wa-gateway-webhook/1.0' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    logger.warn(
      { sessionId, event, status: res.status, url: hook.url },
      'device webhook returned non-OK response',
    );
  }

  return { dispatched: true, status: res.status };
}
