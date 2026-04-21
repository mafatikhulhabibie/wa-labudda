import path from 'node:path';

function intEnv(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function boolEnv(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function enumEnv(name, allowed, fallback) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

export function getConfig() {
  const sendDelayMinMs = intEnv('SEND_DELAY_MIN_MS', 3000);
  const sendDelayMaxMs = intEnv('SEND_DELAY_MAX_MS', 10_000);

  const mysql = {
    host: process.env.MYSQL_HOST?.trim() || '',
    port: intEnv('MYSQL_PORT', 3306),
    user: process.env.MYSQL_USER?.trim() || '',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE?.trim() || '',
  };

  return {
    port: intEnv('PORT', 3000),
    sessionsRoot: path.resolve(process.env.SESSIONS_ROOT || './sessions'),
    qrDir: path.resolve(process.env.QR_DIR || './qr'),
    sendDelayMinMs,
    sendDelayMaxMs: Math.max(sendDelayMinMs, sendDelayMaxMs),
    /** Total attempts: 1 initial + 3 retries */
    sendMaxAttempts: Math.max(4, intEnv('SEND_MAX_ATTEMPTS', 4)),
    sendRetryBackoffMs: intEnv('SEND_RETRY_BACKOFF_MS', 1500),
    broadcastMaxPerMinutePerDevice: intEnv('BROADCAST_MAX_PER_MINUTE_PER_DEVICE', 8),
    broadcastMaxPerHourPerDevice: intEnv('BROADCAST_MAX_PER_HOUR_PER_DEVICE', 120),
    broadcastMaxPerDayPerDevice: intEnv('BROADCAST_MAX_PER_DAY_PER_DEVICE', 600),
    rateLimitMax: intEnv('RATE_LIMIT_MAX', 120),
    rateLimitWindowMs: intEnv('RATE_LIMIT_WINDOW_MS', 60_000),
    /** Optional: POST JSON for each incoming message (messages.upsert) */
    webhookIncomingMessageUrl: process.env.WEBHOOK_INCOMING_MESSAGE_URL?.trim() || '',
    /** Device webhook payload format: default | fonnte */
    webhookPayloadMode: enumEnv('WEBHOOK_PAYLOAD_MODE', ['default', 'fonnte'], 'default'),
    /** Queue backend label for ops / future BullMQ wiring */
    queueDriver: process.env.QUEUE_DRIVER || 'memory',

    mysql,
    dbAutoMigrate: boolEnv('DB_AUTO_MIGRATE', true),
    jwtSecret: process.env.JWT_SECRET?.trim() || 'dev-only-change-me-in-production',
    jwtExpiresInSec: intEnv('JWT_EXPIRES_IN_SEC', 60 * 60 * 24 * 7),
    cookieSecure: boolEnv('COOKIE_SECURE', false),
    /** First admin when `users` table is empty (one-time bootstrap) */
    initialAdminEmail: process.env.INITIAL_ADMIN_EMAIL?.trim() || '',
    initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || '',
    sessionCookieName: process.env.SESSION_COOKIE_NAME?.trim() || 'wg_session',
  };
}
