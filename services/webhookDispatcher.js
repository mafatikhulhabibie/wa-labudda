import { getWebhookBySessionId } from '../repositories/deviceWebhookRepository.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config/index.js';

/**
 * @param {string} event
 * @param {string} sessionId
 * @param {any} data
 */
function buildFonnteLikePayload(event, sessionId, data) {
  const firstIncoming = data?.summary?.[0] || null;
  const sender = firstIncoming?.chat_jid || data?.chat_jid || data?.number || data?.sender || null;
  const message =
    firstIncoming?.text ||
    data?.message ||
    data?.text ||
    '';

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
    member: firstIncoming?.participant_jid || data?.participant_jid || null,
    name: data?.name || '',
    location: data?.location || '',
    url: data?.url || '',
    filename: data?.filename || '',
    extension: data?.extension || '',
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
      ? buildFonnteLikePayload(event, sessionId, data)
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
