import { assertValidSessionId } from '../utils/sessionId.js';
import { evaluateBroadcastGuard } from '../services/broadcastGuard.js';
import { findDeviceBySessionId } from '../repositories/deviceRepository.js';
import { recordSendActivity } from '../repositories/sendActivityRepository.js';
import { whatsappManager } from '../services/whatsappManager.js';

/**
 * POST /api/broadcast (admin only) — each session_id must exist in the database.
 */
export async function broadcastController(req, res) {
  const { session_ids, number, message } = req.body ?? {};

  if (!Array.isArray(session_ids) || session_ids.length === 0) {
    return res.status(400).json({ error: 'session_ids must be a non-empty array' });
  }

  if (number === undefined || number === null || String(number).trim() === '') {
    return res.status(400).json({ error: 'number is required' });
  }

  if (message === undefined || message === null || String(message).trim() === '') {
    return res.status(400).json({ error: 'message is required' });
  }

  const normalized = [];
  for (const id of session_ids) {
    let sid;
    try {
      sid = assertValidSessionId(id);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid session_id' });
    }
    const row = await findDeviceBySessionId(sid);
    if (!row) {
      return res.status(400).json({ error: `Device not registered: ${sid}` });
    }
    normalized.push(sid);
  }

  const guard = await evaluateBroadcastGuard(normalized, 1);
  if (guard.blocked) {
    return res.status(429).json({
      error: 'Broadcast dibatasi guard anti-spam per device (menit/jam/hari).',
      checks: guard.checks,
    });
  }

  const out = await whatsappManager.broadcast(normalized, number, message);
  for (const r of out.results || []) {
    if (!r.success || !r.session_id) continue;
    const dev = await findDeviceBySessionId(r.session_id);
    if (dev) await recordSendActivity(Number(dev.user_id), r.session_id).catch(() => {});
  }
  return res.json({ success: true, ...out });
}
