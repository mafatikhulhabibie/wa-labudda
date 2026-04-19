import {
  countAdmins,
  createUser,
  deleteUserById,
  findUserById,
  listUsersWithStats,
  setUserApiKey,
} from '../repositories/userRepository.js';
import { generateApiKey, sha256Hex } from '../services/authTokens.js';
import { listAllDevicesWithOwner, listDevicesByUserId } from '../repositories/deviceRepository.js';
import { whatsappManager } from '../services/whatsappManager.js';

/**
 * GET /api/admin/users
 */
export async function adminListUsersController(_req, res) {
  const users = await listUsersWithStats();
  return res.json({ users });
}

/**
 * POST /api/admin/users
 * Body: { email, password, role?, generate_api_key? }
 */
export async function adminCreateUserController(req, res) {
  const { full_name, email, password, role, generate_api_key } = req.body ?? {};
  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'full_name, email and password are required' });
  }

  const r = role === 'admin' ? 'admin' : 'member';
  let id;
  try {
    id = await createUser(
      String(full_name).trim(),
      String(email).trim().toLowerCase(),
      String(password),
      r,
    );
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    throw e;
  }

  let api_key;
  if (generate_api_key) {
    const raw = generateApiKey();
    await setUserApiKey(id, sha256Hex(raw), raw.slice(0, 14));
    api_key = raw;
  }

  return res.status(201).json({
    success: true,
    user: {
      id,
      full_name: String(full_name).trim(),
      email: String(email).trim().toLowerCase(),
      role: r,
    },
    ...(api_key ? { api_key } : {}),
  });
}

/**
 * DELETE /api/admin/users/:id
 */
export async function adminDeleteUserController(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  if (id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const row = await findUserById(id);
  if (!row) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (row.role === 'admin') {
    const admins = await countAdmins();
    if (admins <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin' });
    }
  }

  const ownedDevices = await listDevicesByUserId(id);
  for (const d of ownedDevices) {
    await whatsappManager.deleteSession(d.session_id).catch(() => {});
  }

  await deleteUserById(id);
  return res.json({ success: true, deleted: true, id });
}

/**
 * POST /api/admin/users/:id/api-key
 * Rotates API key; returns plaintext once.
 */
export async function adminRegenerateApiKeyController(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const row = await findUserById(id);
  if (!row) {
    return res.status(404).json({ error: 'User not found' });
  }

  const raw = generateApiKey();
  await setUserApiKey(id, sha256Hex(raw), raw.slice(0, 14));
  return res.json({ success: true, api_key: raw });
}

/**
 * GET /api/admin/devices
 */
export async function adminListDevicesController(_req, res) {
  const devices = await listAllDevicesWithOwner();
  return res.json({
    devices: devices.map((d) => ({
      ...d,
      status: whatsappManager.getPublicStatusIfLoaded(d.session_id).status,
    })),
  });
}
