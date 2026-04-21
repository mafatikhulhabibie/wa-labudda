import { getConfig } from '../config/index.js';
import { findDeviceByApiKeySha256 } from '../repositories/deviceRepository.js';
import { findUserByApiKeySha256, findUserById } from '../repositories/userRepository.js';
import { sha256Hex, verifyUserJwt } from '../services/authTokens.js';

function getBearerToken(req) {
  const h = req.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : '';
}

function getJwtFromRequest(req) {
  const cfg = getConfig();
  const cookie = req.cookies?.[cfg.sessionCookieName];
  if (cookie) return cookie;
  return getBearerToken(req);
}

/**
 * Resolves JWT or `x-api-key` (user API key) into `req.user`.
 */
export async function authenticate(req, res, next) {
  try {
    const cfg = getConfig();
    const apiKeyHeader = req.get('x-api-key');
    if (apiKeyHeader && apiKeyHeader.trim()) {
      const hash = sha256Hex(apiKeyHeader.trim());
      const dev = await findDeviceByApiKeySha256(hash);
      if (dev) {
        req.user = {
          id: Number(dev.user_id),
          full_name: dev.owner_full_name || '',
          email: dev.owner_email,
          role: dev.owner_role,
          authVia: 'device_api_key',
        };
        req.authDevice = dev;
        return next();
      }
      const row = await findUserByApiKeySha256(hash);
      if (row) {
        req.user = {
          id: Number(row.id),
          full_name: row.full_name || '',
          email: row.email,
          role: row.role,
          authVia: 'api_key',
        };
        return next();
      }
    }

    const jwt = getJwtFromRequest(req);
    const payload = await verifyUserJwt(jwt);
    if (!payload) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const row = await findUserById(payload.id);
    if (!row) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = {
      id: Number(row.id),
      full_name: row.full_name || payload.full_name || '',
      email: row.email,
      role: row.role,
      authVia: 'jwt',
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** @type {import('express').RequestHandler} */
export function authorizeAuthenticatedActor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'admin' && req.user.role !== 'member') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

/** @type {import('express').RequestHandler} */
export function requireUserAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.authVia === 'device_api_key') {
    return res.status(403).json({
      error: 'User authentication required',
      message: 'Endpoint ini wajib menggunakan sesi user (JWT/cookie atau user API key)',
    });
  }
  return next();
}

/** @type {import('express').RequestHandler} */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  return next();
}
