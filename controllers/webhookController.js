import {
  deleteWebhookByDeviceId,
  getWebhookBySessionId,
  upsertWebhookByDeviceId,
} from '../repositories/deviceWebhookRepository.js';
import { dispatchDeviceWebhook } from '../services/webhookDispatcher.js';

function isValidHttpUrl(raw) {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * GET /api/webhooks/:session_id
 */
export async function getDeviceWebhookController(req, res) {
  const hook = await getWebhookBySessionId(req.device.session_id);
  return res.json({
    webhook: hook
      ? { session_id: hook.session_id, url: hook.url, enabled: hook.enabled, updated_at: hook.updated_at }
      : null,
  });
}

/**
 * PUT /api/webhooks/:session_id
 * Body: { url, enabled }
 */
export async function upsertDeviceWebhookController(req, res) {
  const url = String(req.body?.url || '').trim();
  const enabled = req.body?.enabled !== false;
  if (!url) return res.status(400).json({ error: 'url is required' });
  if (!isValidHttpUrl(url)) {
    return res.status(400).json({ error: 'url must be a valid http(s) URL' });
  }
  await upsertWebhookByDeviceId(Number(req.device.id), url, enabled);
  const hook = await getWebhookBySessionId(req.device.session_id);
  return res.json({ success: true, webhook: hook });
}

/**
 * DELETE /api/webhooks/:session_id
 */
export async function deleteDeviceWebhookController(req, res) {
  await deleteWebhookByDeviceId(Number(req.device.id));
  return res.json({ success: true, deleted: true });
}

/**
 * POST /api/webhooks/:session_id/test
 */
export async function testDeviceWebhookController(req, res) {
  const result = await dispatchDeviceWebhook(req.device.session_id, 'webhook.test', {
    message: 'Test webhook from WA Gateway',
    device: { session_id: req.device.session_id, label: req.device.label || null },
  });
  return res.json({ success: true, result });
}
