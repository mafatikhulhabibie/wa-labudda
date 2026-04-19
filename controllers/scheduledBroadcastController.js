import { findDeviceBySessionId } from '../repositories/deviceRepository.js';
import {
  cancelScheduledBroadcast,
  createScheduledBroadcast,
  getScheduledBroadcastById,
  listScheduledBroadcastsByUser,
} from '../repositories/scheduledBroadcastRepository.js';
import { evaluateBroadcastGuard } from '../services/broadcastGuard.js';
import { assertValidSessionId } from '../utils/sessionId.js';

/**
 * POST /api/broadcast/schedules
 */
export async function createScheduledBroadcastController(req, res) {
  const { session_ids, number, message, scheduled_at } = req.body ?? {};
  if (!Array.isArray(session_ids) || !session_ids.length) {
    return res.status(400).json({ error: 'session_ids must be a non-empty array' });
  }
  if (!number || !String(number).trim()) {
    return res.status(400).json({ error: 'number is required' });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (!scheduled_at || !String(scheduled_at).trim()) {
    return res.status(400).json({ error: 'scheduled_at is required' });
  }

  const when = new Date(String(scheduled_at));
  if (Number.isNaN(when.getTime())) {
    return res.status(400).json({ error: 'scheduled_at must be a valid datetime' });
  }
  if (when.getTime() < Date.now() + 30_000) {
    return res.status(400).json({ error: 'scheduled_at must be at least 30 seconds in the future' });
  }

  const normalized = [];
  for (const id of session_ids) {
    const sid = assertValidSessionId(id);
    const row = await findDeviceBySessionId(sid);
    if (!row) {
      return res.status(400).json({ error: `Device not registered: ${sid}` });
    }
    if (req.user.role !== 'admin' && Number(row.user_id) !== req.user.id) {
      return res.status(403).json({ error: `Forbidden for device: ${sid}` });
    }
    normalized.push(sid);
  }

  const guard = await evaluateBroadcastGuard(normalized, 1);
  if (guard.blocked) {
    return res.status(429).json({
      error: 'Jadwal broadcast ditolak guard anti-spam per device.',
      checks: guard.checks,
    });
  }

  const jobId = await createScheduledBroadcast(
    req.user.id,
    normalized,
    String(number).replace(/\D/g, ''),
    String(message),
    when.toISOString().slice(0, 19).replace('T', ' '),
  );
  return res.status(201).json({ success: true, id: jobId });
}

/**
 * GET /api/broadcast/schedules
 */
export async function listScheduledBroadcastController(req, res) {
  const jobs = await listScheduledBroadcastsByUser(req.user.id);
  return res.json({ jobs });
}

/**
 * DELETE /api/broadcast/schedules/:id
 */
export async function cancelScheduledBroadcastController(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  const row = await getScheduledBroadcastById(id);
  if (!row) return res.status(404).json({ error: 'Schedule not found' });
  if (req.user.role !== 'admin' && Number(row.user_id) !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await cancelScheduledBroadcast(id);
  return res.json({ success: true, id, cancelled: true });
}
