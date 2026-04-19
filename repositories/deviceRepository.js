import { getPool } from '../db/pool.js';

/**
 * @param {number} userId
 * @param {string} sessionId
 * @param {string | null} label
 */
export async function insertDevice(userId, sessionId, label) {
  const [res] = await getPool().query(
    `INSERT INTO devices (user_id, session_id, label) VALUES (:user_id, :session_id, :label)`,
    { user_id: userId, session_id: sessionId, label: label || null },
  );
  return Number(res.insertId);
}

/** @param {string} sessionId */
export async function findDeviceBySessionId(sessionId) {
  const [rows] = await getPool().query(
    `SELECT d.*, u.email AS owner_email, u.role AS owner_role
     FROM devices d
     JOIN users u ON u.id = d.user_id
     WHERE d.session_id = :session_id LIMIT 1`,
    { session_id: sessionId },
  );
  return rows[0] || null;
}

/** @param {number} userId */
export async function listDevicesByUserId(userId) {
  const [rows] = await getPool().query(
    'SELECT id, user_id, session_id, label, api_key_prefix, api_key_sha256 IS NOT NULL AS api_key_configured, created_at FROM devices WHERE user_id = :user_id ORDER BY id DESC',
    { user_id: userId },
  );
  return rows.map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    session_id: r.session_id,
    label: r.label,
    api_key_prefix: r.api_key_prefix || null,
    api_key_configured: Boolean(r.api_key_configured),
    created_at: r.created_at,
  }));
}

export async function listAllDevicesWithOwner() {
  const [rows] = await getPool().query(
    `SELECT d.id, d.session_id, d.label, d.created_at, d.user_id, d.api_key_prefix,
            d.api_key_sha256 IS NOT NULL AS api_key_configured, u.email AS owner_email, u.role AS owner_role
     FROM devices d
     JOIN users u ON u.id = d.user_id
     ORDER BY d.id DESC`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    session_id: r.session_id,
    label: r.label,
    created_at: r.created_at,
    api_key_prefix: r.api_key_prefix || null,
    api_key_configured: Boolean(r.api_key_configured),
    owner_email: r.owner_email,
    owner_role: r.owner_role,
  }));
}

/** @param {string} sha256hex */
export async function findDeviceByApiKeySha256(sha256hex) {
  const [rows] = await getPool().query(
    `SELECT d.*, u.email AS owner_email, u.role AS owner_role, u.full_name AS owner_full_name
     FROM devices d
     JOIN users u ON u.id = d.user_id
     WHERE d.api_key_sha256 = :h
     LIMIT 1`,
    { h: sha256hex },
  );
  return rows[0] || null;
}

/**
 * @param {string} sessionId
 * @param {string} apiKeySha256
 * @param {string} apiKeyPrefix
 */
export async function setDeviceApiKey(sessionId, apiKeySha256, apiKeyPrefix) {
  await getPool().query(
    'UPDATE devices SET api_key_sha256 = :api_key_sha256, api_key_prefix = :api_key_prefix WHERE session_id = :session_id',
    { session_id: sessionId, api_key_sha256: apiKeySha256, api_key_prefix: apiKeyPrefix },
  );
}

/** @param {string} sessionId */
export async function deleteDeviceBySessionId(sessionId) {
  await getPool().query('DELETE FROM devices WHERE session_id = :session_id', { session_id: sessionId });
}
