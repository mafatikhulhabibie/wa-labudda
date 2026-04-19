import { assertValidSessionId } from '../utils/sessionId.js';
import { evaluateBroadcastGuard } from '../services/broadcastGuard.js';

/**
 * GET /api/broadcast/guard?session_ids=a,b,c
 */
export async function broadcastGuardController(req, res) {
  const raw = String(req.query.session_ids || '');
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) {
    return res.status(400).json({ error: 'session_ids query is required' });
  }
  const normalized = ids.map((x) => assertValidSessionId(x));
  const out = await evaluateBroadcastGuard(normalized, 1);
  return res.json(out);
}
