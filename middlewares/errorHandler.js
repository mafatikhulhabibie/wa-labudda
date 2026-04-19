import multer from 'multer';
import { logger } from '../utils/logger.js';

const { MulterError } = multer;

/**
 * Global Express error handler (must be registered last).
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status =
    typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;

  const invalidJson =
    (err instanceof SyntaxError || err.type === 'entity.parse.failed') && 'body' in err;

  if (invalidJson) {
    status = 400;
    err.expose = true;
  }

  if (err instanceof MulterError) {
    err.expose = true;
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      err.message = 'Berkas terlalu besar (maks. 25 MB)';
    } else {
      status = 400;
    }
  }

  const expose =
    Boolean(err.expose) ||
    status === 502 ||
    status === 503 ||
    (status >= 400 && status < 500);

  const message = expose ? (invalidJson ? 'Invalid JSON body' : err.message || 'Error') : 'Internal server error';

  const logLevel = status >= 500 && status !== 502 && status !== 503 ? 'error' : 'warn';
  logger[logLevel](
    {
      err,
      path: req.path,
      method: req.method,
      status,
    },
    'request failed',
  );

  if (res.headersSent) {
    return;
  }

  return res.status(status).json({ error: message });
}
