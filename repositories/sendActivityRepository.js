import { getPool } from '../db/pool.js';

/**
 * Mencatat satu pengiriman pesan (untuk statistik per user / per hari).
 * @param {number} userId — biasanya pemilik device (`devices.user_id`).
 * @param {string} sessionId
 */
export async function recordSendActivity(userId, sessionId) {
  await getPool().query(
    'INSERT INTO send_activity_log (user_id, session_id) VALUES (:userId, :sessionId)',
    { userId, sessionId },
  );
}

/**
 * Hitung volume kirim per session pada jendela menit/jam/hari.
 * @param {string[]} sessionIds
 */
export async function getSendCountsBySession(sessionIds) {
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) return {};
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT session_id,
            SUM(CASE WHEN sent_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE) THEN 1 ELSE 0 END) AS c_minute,
            SUM(CASE WHEN sent_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 ELSE 0 END) AS c_hour,
            SUM(CASE WHEN DATE(sent_at) = CURDATE() THEN 1 ELSE 0 END) AS c_day
     FROM send_activity_log
     WHERE session_id IN (?)
     GROUP BY session_id`,
    [sessionIds],
  );
  const out = {};
  for (const sid of sessionIds) {
    out[sid] = { minute: 0, hour: 0, day: 0 };
  }
  for (const r of rows) {
    out[r.session_id] = {
      minute: Number(r.c_minute || 0),
      hour: Number(r.c_hour || 0),
      day: Number(r.c_day || 0),
    };
  }
  return out;
}
