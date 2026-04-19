import { assertValidSessionId } from '../utils/sessionId.js';
import { findDeviceBySessionId } from '../repositories/deviceRepository.js';

/**
 * Ensures `session_id` exists in DB and caller may access it (owner or admin).
 * Sets `req.device` to the joined row (includes `user_id`, `owner_email`, …).
 */
export async function requireDeviceAccess(req, res, next) {
  try {
    const raw = req.params.session_id ?? req.body?.session_id ?? req.authDevice?.session_id;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return res.status(400).json({ error: 'session_id is required' });
    }

    let sessionId;
    try {
      sessionId = assertValidSessionId(raw);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }

    const device = await findDeviceBySessionId(sessionId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (req.user.authVia === 'device_api_key' && req.authDevice?.session_id !== sessionId) {
      return res.status(403).json({ error: 'Forbidden for this API key device scope' });
    }

    if (req.user.role !== 'admin' && Number(device.user_id) !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.device = device;
    return next();
  } catch (err) {
    return next(err);
  }
}
