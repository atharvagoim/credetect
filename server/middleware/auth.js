import { env } from '../config/env.js';
import { Session, User } from '../models/index.js';
import { randomToken, sha256, safeEqual } from '../utils/crypto.js';
import { AppError, forbidden, unauthorized } from '../utils/errors.js';

// __Host- prefix pins cookies to this exact origin over HTTPS (production only).
export const SESSION_COOKIE = env.isProd ? '__Host-parda_session' : 'parda_session';
export const CSRF_COOKIE = env.isProd ? '__Host-parda_csrf' : 'parda_csrf';

const baseCookie = { secure: env.isProd, path: '/' };

export async function createSession(res, user, req) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 864e5);
  await Session.create({ tokenHash: sha256(token), user: user._id, expiresAt, userAgent: String(req.get('user-agent') || '').slice(0, 200) });
  res.cookie(SESSION_COOKIE, token, { ...baseCookie, httpOnly: true, sameSite: 'lax', expires: expiresAt });
  // Rotate the CSRF token whenever the session changes.
  return issueCsrf(res);
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await Session.deleteOne({ tokenHash: sha256(token) });
  res.clearCookie(SESSION_COOKIE, { ...baseCookie, httpOnly: true, sameSite: 'lax' });
}

export function issueCsrf(res, existing) {
  const token = existing || randomToken(24);
  res.cookie(CSRF_COOKIE, token, { ...baseCookie, httpOnly: false, sameSite: 'strict' });
  return token;
}

/** Loads the session if present; never throws. */
export async function loadSession(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
    if (!session) return next();
    const user = await User.findById(session.user);
    if (!user) return next();
    req.session = session;
    req.user = user;
    // Sliding expiry, refreshed at most once a day.
    if (Date.now() - session.lastSeenAt.getTime() > 864e5) {
      session.lastSeenAt = new Date();
      session.expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 864e5);
      await session.save();
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.user.emailVerifiedAt) return next(new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email address first'));
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden());
  next();
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF: double-submit cookie (header must equal cookie) plus an Origin check.
 * Webhooks and cron authenticate separately and are exempt.
 */
export function csrfProtection(exempt = []) {
  const allowed = new Set([new URL(env.APP_URL).origin, ...(env.isProd ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'])]);
  return (req, _res, next) => {
    if (SAFE.has(req.method) || exempt.some((p) => req.path.startsWith(p))) return next();
    const origin = req.get('origin');
    if (origin && !allowed.has(origin) && !(process.env.VERCEL && origin.endsWith('.vercel.app') && origin === `https://${req.get('host')}`)) {
      return next(new AppError(403, 'BAD_ORIGIN', 'Cross-origin request blocked'));
    }
    const header = req.get('x-csrf-token');
    const cookie = req.cookies?.[CSRF_COOKIE];
    if (!header || !cookie || !safeEqual(header, cookie)) return next(new AppError(403, 'CSRF_FAILED', 'Security token missing or expired. Refresh the page and try again.'));
    next();
  };
}
