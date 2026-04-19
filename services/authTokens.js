import crypto from 'node:crypto';
import * as jose from 'jose';
import { getConfig } from '../config/index.js';

/** @param {string} plain */
export function sha256Hex(plain) {
  return crypto.createHash('sha256').update(plain, 'utf8').digest('hex');
}

export function generateApiKey() {
  const secret = crypto.randomBytes(32).toString('hex');
  return `wg_${secret}`;
}

/**
 * @param {{ id: number, full_name?: string, email: string, role: string }} user
 */
export async function signUserJwt(user) {
  const cfg = getConfig();
  const secret = new TextEncoder().encode(cfg.jwtSecret);
  return new jose.SignJWT({ role: user.role, email: user.email, full_name: user.full_name || '' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${cfg.jwtExpiresInSec}s`)
    .sign(secret);
}

/**
 * @param {string} token
 * @returns {Promise<{ id: number, full_name: string, email: string, role: 'admin'|'member' } | null>}
 */
export async function verifyUserJwt(token) {
  if (!token) return null;
  try {
    const cfg = getConfig();
    const secret = new TextEncoder().encode(cfg.jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret);
    const sub = payload.sub;
    if (!sub || !payload.email || !payload.role) return null;
    const id = Number(sub);
    if (!Number.isFinite(id)) return null;
    if (payload.role !== 'admin' && payload.role !== 'member') return null;
    return {
      id,
      full_name: String(payload.full_name || ''),
      email: String(payload.email),
      role: payload.role,
    };
  } catch {
    return null;
  }
}
