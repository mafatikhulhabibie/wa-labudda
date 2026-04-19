import { getPool } from '../db/pool.js';

/**
 * @param {number} userId
 * @param {string[]} sessionIds
 * @param {string} number
 * @param {string} message
 * @param {string} scheduledAtIso
 */
export async function createScheduledBroadcast(userId, sessionIds, number, message, scheduledAtIso) {
  const [res] = await getPool().query(
    `INSERT INTO scheduled_broadcast_jobs
     (user_id, session_ids_json, number, message, scheduled_at, status)
     VALUES (:user_id, CAST(:session_ids_json AS JSON), :number, :message, :scheduled_at, 'pending')`,
    {
      user_id: userId,
      session_ids_json: JSON.stringify(sessionIds),
      number,
      message,
      scheduled_at: scheduledAtIso,
    },
  );
  return Number(res.insertId);
}

/**
 * @param {number} userId
 */
export async function listScheduledBroadcastsByUser(userId) {
  const [rows] = await getPool().query(
    `SELECT id, user_id, session_ids_json, number, message, scheduled_at, status, sent_at, last_error, created_at
     FROM scheduled_broadcast_jobs
     WHERE user_id = :user_id
     ORDER BY id DESC
     LIMIT 100`,
    { user_id: userId },
  );
  return rows.map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    session_ids: JSON.parse(r.session_ids_json || '[]'),
    number: r.number,
    message: r.message,
    scheduled_at: r.scheduled_at,
    status: r.status,
    sent_at: r.sent_at || null,
    last_error: r.last_error || null,
    created_at: r.created_at,
  }));
}

/**
 * @param {number} id
 */
export async function getScheduledBroadcastById(id) {
  const [rows] = await getPool().query(
    `SELECT id, user_id, session_ids_json, number, message, scheduled_at, status, sent_at, last_error, created_at
     FROM scheduled_broadcast_jobs
     WHERE id = :id
     LIMIT 1`,
    { id },
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    session_ids: JSON.parse(r.session_ids_json || '[]'),
    number: r.number,
    message: r.message,
    scheduled_at: r.scheduled_at,
    status: r.status,
    sent_at: r.sent_at || null,
    last_error: r.last_error || null,
    created_at: r.created_at,
  };
}

/**
 * @param {number} id
 */
export async function cancelScheduledBroadcast(id) {
  await getPool().query(
    `UPDATE scheduled_broadcast_jobs
     SET status = 'cancelled'
     WHERE id = :id AND status IN ('pending','processing')`,
    { id },
  );
}

/**
 * Claim due jobs for this process (single-node friendly).
 * @param {number} limit
 */
export async function claimDueScheduledBroadcasts(limit = 10) {
  await getPool().query(
    `UPDATE scheduled_broadcast_jobs
     SET status = 'processing', picked_at = NOW()
     WHERE status = 'pending' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT ${Math.max(1, Math.min(100, Number(limit) || 10))}`,
  );

  const [rows] = await getPool().query(
    `SELECT id, user_id, session_ids_json, number, message, scheduled_at
     FROM scheduled_broadcast_jobs
     WHERE status = 'processing'
       AND picked_at IS NOT NULL
       AND picked_at >= DATE_SUB(NOW(), INTERVAL 30 SECOND)
     ORDER BY picked_at ASC`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    session_ids: JSON.parse(r.session_ids_json || '[]'),
    number: r.number,
    message: r.message,
    scheduled_at: r.scheduled_at,
  }));
}

/**
 * @param {number} id
 */
export async function markScheduledBroadcastSent(id) {
  await getPool().query(
    `UPDATE scheduled_broadcast_jobs
     SET status = 'sent', sent_at = NOW(), last_error = NULL
     WHERE id = :id`,
    { id },
  );
}

/**
 * @param {number} id
 * @param {string} errorText
 */
export async function markScheduledBroadcastFailed(id, errorText) {
  await getPool().query(
    `UPDATE scheduled_broadcast_jobs
     SET status = 'failed', last_error = :last_error
     WHERE id = :id`,
    { id, last_error: String(errorText || 'Unknown error').slice(0, 2000) },
  );
}
