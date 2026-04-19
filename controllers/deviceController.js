import { assertValidSessionId } from '../utils/sessionId.js';
import { generateApiKey, sha256Hex } from '../services/authTokens.js';
import { whatsappManager } from '../services/whatsappManager.js';
import {
  deleteDeviceBySessionId,
  findDeviceBySessionId,
  insertDevice,
  listAllDevicesWithOwner,
  listDevicesByUserId,
  setDeviceApiKey,
} from '../repositories/deviceRepository.js';

/**
 * GET /api/devices
 */
export async function listDevicesController(req, res) {
  if (req.user.authVia === 'device_api_key' && req.authDevice) {
    const d = req.authDevice;
    return res.json({
      devices: [
        {
          id: Number(d.id),
          user_id: Number(d.user_id),
          session_id: d.session_id,
          label: d.label,
          api_key_prefix: d.api_key_prefix || null,
          api_key_configured: Boolean(d.api_key_sha256),
          created_at: d.created_at,
          status: whatsappManager.getPublicStatusIfLoaded(d.session_id).status,
        },
      ],
    });
  }

  if (String(req.query.scope || '') === 'all') {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const devices = await listAllDevicesWithOwner();
    return res.json({
      devices: devices.map((d) => ({
        ...d,
        status: whatsappManager.getPublicStatusIfLoaded(d.session_id).status,
      })),
    });
  }

  const rows = await listDevicesByUserId(req.user.id);
  return res.json({
    devices: rows.map((d) => ({
      ...d,
      status: whatsappManager.getPublicStatusIfLoaded(d.session_id).status,
    })),
  });
}

/**
 * POST /api/devices
 */
export async function createDeviceController(req, res) {
  if (req.user.authVia === 'device_api_key') {
    return res.status(403).json({ error: 'Device API key cannot create new devices' });
  }
  const { session_id, label } = req.body ?? {};
  const sessionId = assertValidSessionId(session_id);

  const existing = await findDeviceBySessionId(sessionId);
  if (existing) {
    return res.status(409).json({ error: 'session_id is already registered' });
  }

  await insertDevice(req.user.id, sessionId, label ?? null);

  try {
    const status = await whatsappManager.createSession(sessionId);
    return res.status(201).json({ success: true, session_id: sessionId, ...status, label: label ?? null });
  } catch (err) {
    await deleteDeviceBySessionId(sessionId);
    throw err;
  }
}

/**
 * POST /api/devices/:session_id/connect
 */
export async function connectDeviceController(req, res) {
  const sessionId = assertValidSessionId(req.params.session_id);
  if (req.user.authVia === 'device_api_key' && req.authDevice?.session_id !== sessionId) {
    return res.status(403).json({ error: 'Forbidden for this API key device scope' });
  }
  const device = await findDeviceBySessionId(sessionId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }
  if (req.user.role !== 'admin' && Number(device.user_id) !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const status = await whatsappManager.createSession(sessionId);
  return res.json({ success: true, ...status });
}

/**
 * POST /api/devices/:session_id/disconnect
 */
export async function disconnectDeviceController(req, res) {
  const sessionId = assertValidSessionId(req.params.session_id);
  const device = await findDeviceBySessionId(sessionId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }
  if (req.user.role !== 'admin' && Number(device.user_id) !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const status = await whatsappManager.stopRuntime(sessionId);
  return res.json({ success: true, ...status });
}

/**
 * DELETE /api/devices/:session_id
 */
export async function deleteDeviceController(req, res) {
  const sessionId = assertValidSessionId(req.params.session_id);
  const device = await findDeviceBySessionId(sessionId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }
  if (req.user.role !== 'admin' && Number(device.user_id) !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await whatsappManager.deleteSession(sessionId);
  await deleteDeviceBySessionId(sessionId);
  return res.json({ success: true, session_id: sessionId, deleted: true });
}

/**
 * POST /api/devices/:session_id/api-key
 * Rotates API key per device; returns plaintext once.
 */
export async function rotateDeviceApiKeyController(req, res) {
  const sessionId = assertValidSessionId(req.params.session_id);
  const device = await findDeviceBySessionId(sessionId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }
  if (req.user.role !== 'admin' && Number(device.user_id) !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const raw = generateApiKey();
  await setDeviceApiKey(sessionId, sha256Hex(raw), raw.slice(0, 14));
  return res.json({ success: true, session_id: sessionId, api_key: raw });
}
