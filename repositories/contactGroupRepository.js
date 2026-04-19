import { getPool } from '../db/pool.js';

/** @param {number} userId */
export async function listGroupsByUserId(userId) {
  const [rows] = await getPool().query(
    'SELECT id, user_id, name, created_at FROM contact_groups WHERE user_id = :user_id ORDER BY name ASC',
    { user_id: userId },
  );
  return rows.map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    name: r.name,
    created_at: r.created_at,
  }));
}

/**
 * @param {number} userId
 * @param {string} name
 */
export async function insertGroup(userId, name) {
  const [res] = await getPool().query(
    'INSERT INTO contact_groups (user_id, name) VALUES (:user_id, :name)',
    { user_id: userId, name },
  );
  return Number(res.insertId);
}

/**
 * @param {number} id
 * @param {number} userId
 */
export async function findGroupByIdForUser(id, userId) {
  const [rows] = await getPool().query(
    'SELECT * FROM contact_groups WHERE id = :id AND user_id = :user_id LIMIT 1',
    { id, user_id: userId },
  );
  return rows[0] || null;
}

/**
 * @param {number} id
 * @param {number} userId
 * @param {string} name
 */
export async function updateGroupName(id, userId, name) {
  await getPool().query(
    'UPDATE contact_groups SET name = :name WHERE id = :id AND user_id = :user_id',
    { id, user_id: userId, name },
  );
}

/** @param {number} id @param {number} userId */
export async function deleteGroup(id, userId) {
  await getPool().query('DELETE FROM contact_groups WHERE id = :id AND user_id = :user_id', {
    id,
    user_id: userId,
  });
}
