import { getPool } from '../db/pool.js';

/** @param {number} deviceId */
export async function ensureAutoReplySettings(deviceId) {
  await getPool().query(
    `INSERT INTO device_auto_reply_settings (device_id, enabled)
     VALUES (:device_id, 0)
     ON DUPLICATE KEY UPDATE device_id = device_id`,
    { device_id: deviceId },
  );
}

/** @param {string} sessionId */
export async function getAutoReplyConfigBySessionId(sessionId) {
  const [rows] = await getPool().query(
    `SELECT d.id AS device_id, d.user_id, d.session_id,
            COALESCE(s.enabled, 0) AS enabled,
            COALESCE(s.default_reply_text, '') AS default_reply_text
     FROM devices d
     LEFT JOIN device_auto_reply_settings s ON s.device_id = d.id
     WHERE d.session_id = :session_id
     LIMIT 1`,
    { session_id: sessionId },
  );
  return rows[0] || null;
}

/**
 * @param {number} deviceId
 * @param {boolean} enabled
 * @param {string} defaultReplyText
 */
export async function upsertAutoReplySettings(deviceId, enabled, defaultReplyText = '') {
  await getPool().query(
    `INSERT INTO device_auto_reply_settings (device_id, enabled, default_reply_text)
     VALUES (:device_id, :enabled, :default_reply_text)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       default_reply_text = VALUES(default_reply_text)`,
    {
      device_id: deviceId,
      enabled: enabled ? 1 : 0,
      default_reply_text: String(defaultReplyText || '').trim(),
    },
  );
}

/** @param {number} deviceId */
export async function listAutoReplyRulesByDeviceId(deviceId) {
  const [rows] = await getPool().query(
    `SELECT id, device_id, match_type, keyword, reply_text, case_sensitive, priority, enabled, created_at, updated_at
     FROM device_auto_reply_rules
     WHERE device_id = :device_id
     ORDER BY priority ASC, id ASC`,
    { device_id: deviceId },
  );
  return rows.map((r) => ({
    id: Number(r.id),
    device_id: Number(r.device_id),
    match_type: r.match_type,
    keyword: r.keyword,
    reply_text: r.reply_text,
    case_sensitive: Boolean(r.case_sensitive),
    priority: Number(r.priority),
    enabled: Boolean(r.enabled),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

/**
 * @param {number} deviceId
 * @param {{ match_type: 'exact'|'contains'|'starts_with'|'regex', keyword: string, reply_text: string, case_sensitive: boolean, priority: number, enabled: boolean }} input
 */
export async function createAutoReplyRule(deviceId, input) {
  const [res] = await getPool().query(
    `INSERT INTO device_auto_reply_rules
     (device_id, match_type, keyword, reply_text, case_sensitive, priority, enabled)
     VALUES (:device_id, :match_type, :keyword, :reply_text, :case_sensitive, :priority, :enabled)`,
    {
      device_id: deviceId,
      match_type: input.match_type,
      keyword: input.keyword,
      reply_text: input.reply_text,
      case_sensitive: input.case_sensitive ? 1 : 0,
      priority: input.priority,
      enabled: input.enabled ? 1 : 0,
    },
  );
  return Number(res.insertId);
}

/**
 * @param {number} deviceId
 * @param {number} ruleId
 */
export async function findAutoReplyRuleById(deviceId, ruleId) {
  const [rows] = await getPool().query(
    `SELECT id, device_id, match_type, keyword, reply_text, case_sensitive, priority, enabled, created_at, updated_at
     FROM device_auto_reply_rules
     WHERE id = :id AND device_id = :device_id
     LIMIT 1`,
    { id: ruleId, device_id: deviceId },
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    device_id: Number(r.device_id),
    match_type: r.match_type,
    keyword: r.keyword,
    reply_text: r.reply_text,
    case_sensitive: Boolean(r.case_sensitive),
    priority: Number(r.priority),
    enabled: Boolean(r.enabled),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * @param {number} deviceId
 * @param {number} ruleId
 * @param {{ match_type: 'exact'|'contains'|'starts_with'|'regex', keyword: string, reply_text: string, case_sensitive: boolean, priority: number, enabled: boolean }} input
 */
export async function updateAutoReplyRule(deviceId, ruleId, input) {
  await getPool().query(
    `UPDATE device_auto_reply_rules
     SET match_type = :match_type,
         keyword = :keyword,
         reply_text = :reply_text,
         case_sensitive = :case_sensitive,
         priority = :priority,
         enabled = :enabled
     WHERE id = :id AND device_id = :device_id`,
    {
      id: ruleId,
      device_id: deviceId,
      match_type: input.match_type,
      keyword: input.keyword,
      reply_text: input.reply_text,
      case_sensitive: input.case_sensitive ? 1 : 0,
      priority: input.priority,
      enabled: input.enabled ? 1 : 0,
    },
  );
}

/**
 * @param {number} deviceId
 * @param {number} ruleId
 */
export async function deleteAutoReplyRule(deviceId, ruleId) {
  const [res] = await getPool().query(
    'DELETE FROM device_auto_reply_rules WHERE id = :id AND device_id = :device_id',
    { id: ruleId, device_id: deviceId },
  );
  return Number(res.affectedRows) > 0;
}

