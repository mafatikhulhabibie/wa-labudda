import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import pinoHttp from 'pino-http';
import { getConfig } from './config/index.js';
import { closePool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { logger } from './utils/logger.js';
import { createRateLimiter } from './middlewares/rateLimit.js';
import { errorHandler } from './middlewares/errorHandler.js';
import apiRoutes from './routes/index.js';
import { ensureBootstrapAdmin } from './services/bootstrapAdmin.js';
import { attachInboxSocket, closeInboxSocket } from './services/inboxSocket.js';
import { scheduledBroadcastRunner } from './services/scheduledBroadcastRunner.js';
import { whatsappManager } from './services/whatsappManager.js';

const cfg = getConfig();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => {
        const url = req.url || '';
        if (url === '/health' || url.startsWith('/health?')) return true;
        if (url.startsWith('/api/auth/login')) return true;
        if (url.startsWith('/api/session/status')) return true;
        if (url.startsWith('/ws/inbox')) return true;
        return false;
      },
    },
    customLogLevel(_req, res, err) {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          id: req.id,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

/** Liveness for orchestrators / PM2 hooks (no API key). */
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const rateLimiter = createRateLimiter({
  max: cfg.rateLimitMax,
  windowMs: cfg.rateLimitWindowMs,
  logger,
});

/** API sebelum static: hindari benturan jika ada berkas di `public/` yang meniru path API. */
app.use('/api', rateLimiter, apiRoutes);

app.use(express.static(path.join(__dirname, 'public'), { index: ['index.html'] }));

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

/** @type {import('http').Server | undefined} */
let server;

/** PM2 / containers: allow in-flight HTTP to finish before exit. */
async function shutdown(signal) {
  logger.info({ signal }, 'shutdown requested');

  closeInboxSocket();

  await closePool().catch((err) => {
    logger.warn({ err }, 'mysql pool close failed during shutdown');
  });

  await whatsappManager.stopAll().catch((err) => {
    logger.warn({ err }, 'whatsapp sessions stop failed during shutdown');
  });
  scheduledBroadcastRunner.stop();

  if (!server) {
    process.exit(0);
    return;
  }

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'http server close failed');
      process.exit(1);
      return;
    }

    logger.info('http server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('shutdown forced after timeout');
    process.exit(1);
  }, 10_000).unref();
}

async function main() {
  await runMigrations();
  await ensureBootstrapAdmin();

  server = app.listen(cfg.port, () => {
    logger.info({ port: cfg.port, env: process.env.NODE_ENV }, 'http server listening');
  });

  attachInboxSocket(server);
  scheduledBroadcastRunner.start();

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error');
  process.exit(1);
});
