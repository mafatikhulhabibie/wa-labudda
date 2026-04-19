import { getWebhookBySessionId } from '../repositories/deviceWebhookRepository.js';
import { logger } from '../utils/logger.js';

/**
 * @param {string} sessionId
 * @param {string} event
 * @param {unknown} data
 */
export async function dispatchDeviceWebhook(sessionId, event, data) {
  const hook = await getWebhookBySessionId(sessionId);
  if (!hook || !hook.enabled || !hook.url) return { dispatched: false, reason: 'disabled_or_missing' };

  const payload = {
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
