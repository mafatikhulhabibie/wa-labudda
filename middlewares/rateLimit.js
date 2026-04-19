/**
 * Simple fixed-window rate limiter per IP (in-memory).
 * @param {{ max: number; windowMs: number; logger?: import('pino').Logger }} opts
 */
export function createRateLimiter({ max, windowMs, logger }) {
  /** @type {Map<string, { count: number; resetAt: number }>} */
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(ip);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      if (logger) {
        logger.warn({ ip, count: bucket.count, max }, 'rate limit exceeded');
      }
      return res.status(429).json({ error: 'Too many requests' });
    }

    return next();
  };
}
