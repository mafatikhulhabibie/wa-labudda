import { getConfig } from '../config/index.js';
import {
  touchLastLogin,
  updateUserEmail,
  updateUserFullName,
  updateUserPassword,
  verifyPassword,
} from '../repositories/userRepository.js';
import { signUserJwt } from '../services/authTokens.js';

function sessionCookieBase() {
  const cfg = getConfig();
  return {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: 'lax',
    path: '/',
  };
}

/**
 * POST /api/auth/login
 */
export async function loginController(req, res) {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const row = await verifyPassword(String(email), String(password));
  if (!row) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  await touchLastLogin(Number(row.id)).catch(() => {});

  const cfg = getConfig();
  const user = { id: Number(row.id), full_name: row.full_name || '', email: row.email, role: row.role };
  const token = await signUserJwt(user);

  res.cookie(cfg.sessionCookieName, token, {
    ...sessionCookieBase(),
    maxAge: cfg.jwtExpiresInSec * 1000,
  });

  return res.json({
    success: true,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      api_key_configured: Boolean(row.api_key_sha256),
      api_key_prefix: row.api_key_prefix || null,
    },
  });
}

/**
 * POST /api/auth/logout
 */
export async function logoutController(req, res) {
  const cfg = getConfig();
  res.clearCookie(cfg.sessionCookieName, sessionCookieBase());
  return res.json({ success: true });
}

/**
 * GET /api/auth/me
 */
export async function meController(req, res) {
  return res.json({
    user: {
      id: req.user.id,
      full_name: req.user.full_name || '',
      email: req.user.email,
      role: req.user.role,
      auth_via: req.user.authVia,
    },
  });
}

/**
 * PATCH /api/auth/profile
 * Body: { full_name, email }
 */
export async function updateProfileController(req, res) {
  const full_name = String(req.body?.full_name || '').trim();
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  if (!full_name || !email) {
    return res.status(400).json({ error: 'Nama dan email wajib diisi' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Format email tidak valid' });
  }
  try {
    await updateUserFullName(Number(req.user.id), full_name);
    await updateUserEmail(Number(req.user.id), email);
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email sudah digunakan' });
    }
    throw e;
  }

  const cfg = getConfig();
  const user = { id: Number(req.user.id), full_name, email, role: req.user.role };
  const token = await signUserJwt(user);
  res.cookie(cfg.sessionCookieName, token, {
    ...sessionCookieBase(),
    maxAge: cfg.jwtExpiresInSec * 1000,
  });

  return res.json({ success: true, user });
}

/**
 * PATCH /api/auth/password
 * Body: { current_password, new_password }
 */
export async function updatePasswordController(req, res) {
  const current_password = String(req.body?.current_password || '');
  const new_password = String(req.body?.new_password || '');
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Password lama dan baru wajib diisi' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  }
  const row = await verifyPassword(String(req.user.email), current_password);
  if (!row) {
    return res.status(401).json({ error: 'Password lama tidak cocok' });
  }
  await updateUserPassword(Number(req.user.id), new_password);
  return res.json({ success: true });
}
