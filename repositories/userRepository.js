import bcrypt from 'bcrypt';
import { getPool } from '../db/pool.js';

const BCRYPT_ROUNDS = 10;

export async function countUsers() {
  const [rows] = await getPool().query('SELECT COUNT(*) AS c FROM users');
  return Number(rows[0].c);
}

export async function countAdmins() {
  const [rows] = await getPool().query(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`);
  return Number(rows[0].c);
}

/**
 * @param {string} email
 */
export async function findUserByEmail(email) {
  const [rows] = await getPool().query('SELECT * FROM users WHERE email = :email LIMIT 1', {
    email: email.toLowerCase(),
  });
  return rows[0] || null;
}

/**
 * @param {number} id
 */
export async function findUserById(id) {
  const [rows] = await getPool().query('SELECT * FROM users WHERE id = :id LIMIT 1', { id });
  return rows[0] || null;
}

/**
 * @param {string} sha256hex
 */
export async function findUserByApiKeySha256(sha256hex) {
  const [rows] = await getPool().query(
    'SELECT * FROM users WHERE api_key_sha256 = :h LIMIT 1',
    { h: sha256hex },
  );
  return rows[0] || null;
}

/**
 * @param {string} fullName
 * @param {string} email
 * @param {string} plainPassword
 * @param {'admin'|'member'} role
 */
export async function createUser(fullName, email, plainPassword, role) {
  const password_hash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
  const [res] = await getPool().query(
    `INSERT INTO users (full_name, email, password_hash, role, api_key_sha256, api_key_prefix)
     VALUES (:full_name, :email, :password_hash, :role, NULL, NULL)`,
    {
      full_name: String(fullName || '').trim(),
      email: email.toLowerCase(),
      password_hash,
      role,
    },
  );
  return Number(res.insertId);
}

/**
 * @param {number} id
 * @param {string} plainPassword
 */
export async function updateUserPassword(id, plainPassword) {
  const password_hash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
  await getPool().query('UPDATE users SET password_hash = :password_hash WHERE id = :id', {
    id,
    password_hash,
  });
}

/**
 * @param {number} id
 * @param {string} email
 */
export async function updateUserEmail(id, email) {
  await getPool().query('UPDATE users SET email = :email WHERE id = :id', {
    id,
    email: email.toLowerCase(),
  });
}

/**
 * @param {number} id
 * @param {string} fullName
 */
export async function updateUserFullName(id, fullName) {
  await getPool().query('UPDATE users SET full_name = :full_name WHERE id = :id', {
    id,
    full_name: String(fullName || '').trim(),
  });
}

/**
 * @param {string} email
 * @param {string} plain
 */
export async function verifyPassword(email, plain) {
  const row = await findUserByEmail(email);
  if (!row) return null;
  const ok = await bcrypt.compare(plain, row.password_hash);
  if (!ok) return null;
  return row;
}

/**
 * @param {number} userId
 * @param {string} apiKeySha256
 * @param {string} apiKeyPrefix
 */
export async function setUserApiKey(userId, apiKeySha256, apiKeyPrefix) {
  await getPool().query(
    `UPDATE users SET api_key_sha256 = :api_key_sha256, api_key_prefix = :api_key_prefix WHERE id = :id`,
    { id: userId, api_key_sha256: apiKeySha256, api_key_prefix: apiKeyPrefix },
  );
}

/** @param {number} userId */
export async function clearUserApiKey(userId) {
  await getPool().query(
    'UPDATE users SET api_key_sha256 = NULL, api_key_prefix = NULL WHERE id = :id',
    { id: userId },
  );
}

export async function listUsers() {
  const [rows] = await getPool().query(
    `SELECT id, email, role, api_key_prefix, api_key_sha256 IS NOT NULL AS api_key_configured, created_at
     FROM users ORDER BY id ASC`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    full_name: r.full_name || '',
    email: r.email,
    role: r.role,
    api_key_prefix: r.api_key_prefix || null,
    api_key_configured: Boolean(r.api_key_configured),
    created_at: r.created_at,
  }));
}

/** @param {number} userId */
export async function touchLastLogin(userId) {
  await getPool().query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id', { id: userId });
}

/**
 * Daftar pengguna + jumlah device + aktivitas kirim (log) untuk dashboard admin.
 */
export async function listUsersWithStats() {
  const [rows] = await getPool().query(
    `SELECT u.id, u.full_name, u.email, u.role, u.api_key_prefix,
            u.api_key_sha256 IS NOT NULL AS api_key_configured,
            u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS device_count,
            (SELECT COUNT(*) FROM send_activity_log s
             WHERE s.user_id = u.id AND DATE(s.sent_at) = CURDATE()) AS messages_sent_today,
            (SELECT COUNT(*) FROM send_activity_log s
             WHERE s.user_id = u.id AND s.sent_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS messages_sent_7d
     FROM users u
     ORDER BY u.id ASC`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    full_name: r.full_name || '',
    email: r.email,
    role: r.role,
    api_key_prefix: r.api_key_prefix || null,
    api_key_configured: Boolean(r.api_key_configured),
    created_at: r.created_at,
    last_login_at: r.last_login_at || null,
    device_count: Number(r.device_count ?? 0),
    messages_sent_today: Number(r.messages_sent_today ?? 0),
    messages_sent_7d: Number(r.messages_sent_7d ?? 0),
  }));
}

/** @param {number} id */
export async function deleteUserById(id) {
  await getPool().query('DELETE FROM users WHERE id = :id', { id });
}
