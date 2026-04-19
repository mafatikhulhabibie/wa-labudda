import { getPool } from '../db/pool.js';

/**
 * @param {string} sessionId
 */
export async function getWebhookBySessionId(sessionId) {
  const [rows] = await getPool().query(
    `SELECT w.id, w.url, w.enabled, w.created_at, w.updated_at,
            d.id AS device_id, d.session_id, d.label
     FROM device_webhooks w
     JOIN devices d ON d.id = w.device_id
     WHERE d.session_id = :session_id
     LIMIT 1`,
    { session_id: sessionId },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    device_id: Number(row.device_id),
    session_id: row.session_id,
    label: row.label || null,
    url: row.url,
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @param {number} deviceId
 * @param {string} url
 * @param {boolean} enabled
 */
export async function upsertWebhookByDeviceId(deviceId, url, enabled) {
  await getPool().query(
    `INSERT INTO device_webhooks (device_id, url, enabled)
     VALUES (:device_id, :url, :enabled)
     ON DUPLICATE KEY UPDATE url = VALUES(url), enabled = VALUES(enabled)`,
    { device_id: deviceId, url, enabled: enabled ? 1 : 0 },
  );
}

/**
 * @param {number} deviceId
 */
export async function deleteWebhookByDeviceId(deviceId) {
  await getPool().query('DELETE FROM device_webhooks WHERE device_id = :device_id', {
    device_id: deviceId,
  });
}
