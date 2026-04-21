import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Runs `schema.sql` (idempotent CREATE IF NOT EXISTS).
 */
export async function runMigrations() {
  const cfg = getConfig();
  if (!cfg.dbAutoMigrate) {
    logger.info('DB_AUTO_MIGRATE=false — skipping SQL migrations');
    return;
  }

  const m = cfg.mysql;
  if (!m.host || !m.database) {
    throw new Error('MySQL is not configured (MYSQL_HOST, MYSQL_DATABASE).');
  }

  const sql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: m.host,
    port: m.port,
    user: m.user,
    password: m.password,
    database: m.database,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    await applySchemaPatches(conn);
  } finally {
    await conn.end();
  }

  logger.info('database schema applied (migrations)');
}

/**
 * Perubahan skema inkremental (kolom baru pada tabel yang sudah ada).
 * @param {import('mysql2/promise').Connection} conn
 */
async function applySchemaPatches(conn) {
  try {
    await conn.query(
      'ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL DEFAULT NULL AFTER updated_at',
    );
    logger.info('schema patch: users.last_login_at');
  } catch (e) {
    const msg = String(e?.message || '');
    if (e?.errno !== 1060 && !msg.includes('Duplicate column')) throw e;
  }

  try {
    await conn.query("ALTER TABLE users ADD COLUMN full_name VARCHAR(150) NOT NULL DEFAULT '' AFTER id");
    logger.info('schema patch: users.full_name');
  } catch (e) {
    const msg = String(e?.message || '');
    if (e?.errno !== 1060 && !msg.includes('Duplicate column')) throw e;
  }

  try {
    await conn.query(
      'ALTER TABLE devices ADD COLUMN api_key_sha256 CHAR(64) NULL DEFAULT NULL AFTER label',
    );
    logger.info('schema patch: devices.api_key_sha256');
  } catch (e) {
    const msg = String(e?.message || '');
    if (e?.errno !== 1060 && !msg.includes('Duplicate column')) throw e;
  }

  try {
    await conn.query(
      'ALTER TABLE devices ADD COLUMN api_key_prefix VARCHAR(24) NULL DEFAULT NULL AFTER api_key_sha256',
    );
    logger.info('schema patch: devices.api_key_prefix');
  } catch (e) {
    const msg = String(e?.message || '');
    if (e?.errno !== 1060 && !msg.includes('Duplicate column')) throw e;
  }

  try {
    await conn.query('ALTER TABLE devices ADD UNIQUE KEY uq_devices_api_key (api_key_sha256)');
    logger.info('schema patch: devices.uq_devices_api_key');
  } catch (e) {
    const msg = String(e?.message || '');
    if (e?.errno !== 1061 && !msg.includes('Duplicate key name')) throw e;
  }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS scheduled_broadcast_jobs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      session_ids_json JSON NOT NULL,
      number VARCHAR(32) NOT NULL,
      message TEXT NOT NULL,
      scheduled_at DATETIME NOT NULL,
      status ENUM('pending','processing','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
      picked_at DATETIME NULL DEFAULT NULL,
      sent_at DATETIME NULL DEFAULT NULL,
      last_error TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_sched_user_status_time (user_id, status, scheduled_at),
      KEY idx_sched_status_time (status, scheduled_at),
      CONSTRAINT fk_sched_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS device_auto_reply_settings (
      device_id BIGINT UNSIGNED NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (device_id),
      CONSTRAINT fk_auto_reply_settings_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS device_auto_reply_rules (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      device_id BIGINT UNSIGNED NOT NULL,
      match_type ENUM('exact','contains','starts_with','regex') NOT NULL DEFAULT 'contains',
      keyword VARCHAR(300) NOT NULL,
      reply_text TEXT NOT NULL,
      case_sensitive TINYINT(1) NOT NULL DEFAULT 0,
      priority INT NOT NULL DEFAULT 100,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_auto_reply_rules_device_priority (device_id, priority, id),
      CONSTRAINT fk_auto_reply_rules_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}
