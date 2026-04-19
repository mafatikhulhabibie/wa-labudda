import { getPool } from '../db/pool.js';

/**
 * @param {number} userId
 * @param {number | null} groupId filter; omit or null = all
 */
export async function listContactsByUserId(userId, groupId = null) {
  let sql = `
    SELECT c.id, c.user_id, c.group_id, c.display_name, c.phone, c.created_at, g.name AS group_name
    FROM contacts c
    LEFT JOIN contact_groups g ON g.id = c.group_id
    WHERE c.user_id = :user_id`;
  const params = { user_id: userId };
  if (groupId !== null && groupId !== undefined && String(groupId) !== '') {
    sql += ' AND c.group_id <=> :group_id';
    params.group_id = groupId;
  }
  sql += ' ORDER BY g.name IS NULL, g.name ASC, c.display_name ASC';
  const [rows] = await getPool().query(sql, params);
  return rows.map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    group_id: r.group_id != null ? Number(r.group_id) : null,
    display_name: r.display_name,
    phone: r.phone,
    group_name: r.group_name || null,
    created_at: r.created_at,
  }));
}

/**
 * @param {number} userId
 * @param {string} displayName
 * @param {string} phone
 * @param {number | null} groupId
 */
export async function insertContact(userId, displayName, phone, groupId) {
  const [res] = await getPool().query(
    `INSERT INTO contacts (user_id, group_id, display_name, phone)
     VALUES (:user_id, :group_id, :display_name, :phone)`,
    {
      user_id: userId,
      group_id: groupId,
      display_name: displayName,
      phone,
    },
  );
  return Number(res.insertId);
}

/**
 * @param {number} id
 * @param {number} userId
 */
export async function findContactByIdForUser(id, userId) {
  const [rows] = await getPool().query(
    'SELECT * FROM contacts WHERE id = :id AND user_id = :user_id LIMIT 1',
    { id, user_id: userId },
  );
  return rows[0] || null;
}

/**
 * @param {number} id
 * @param {number} userId
 * @param {{ display_name?: string, phone?: string, group_id?: number | null }} patch
 */
export async function updateContact(id, userId, patch) {
  const fields = [];
  const params = { id, user_id: userId };
  if (patch.display_name !== undefined) {
    fields.push('display_name = :display_name');
    params.display_name = patch.display_name;
  }
  if (patch.phone !== undefined) {
    fields.push('phone = :phone');
    params.phone = patch.phone;
  }
  if (patch.group_id !== undefined) {
    fields.push('group_id = :group_id');
    params.group_id = patch.group_id;
  }
  if (!fields.length) return;
  await getPool().query(
    `UPDATE contacts SET ${fields.join(', ')} WHERE id = :id AND user_id = :user_id`,
    params,
  );
}

/** @param {number} id @param {number} userId */
export async function deleteContact(id, userId) {
  await getPool().query('DELETE FROM contacts WHERE id = :id AND user_id = :user_id', {
    id,
    user_id: userId,
  });
}
