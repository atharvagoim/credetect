import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AuthToken, Session, User } from '../models/index.js';
import { createSession, destroySession, issueCsrf, CSRF_COOKIE } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validate } from '../middleware/common.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { ah, AppError, badRequest } from '../utils/errors.js';
import { sendEmail } from '../services/messaging.js';
import { audit } from '../services/events.js';
import { serializeUser } from '../services/serializers.js';

const router = Router();
const BCRYPT_COST = env.isTest ? 4 : 12;
let dummyHash;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash('not-a-real-password-' + randomToken(8), BCRYPT_COST));

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Include at least one letter and one number');

const ipLimit = (name, max, windowMin = 15) => rateLimit({ name, max, windowMs: windowMin * 60_000 });
const emailLimit = (name, max, windowMin = 60) =>
  rateLimit({ name, max, windowMs: windowMin * 60_000, by: (req) => String(req.body?.email || '').toLowerCase() });

async function issueToken(user, type, ttlMs) {
  const token = randomToken(32);
  await AuthToken.deleteMany({ user: user._id, type, usedAt: null });
  await AuthToken.create({ user: user._id, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

async function consumeToken(token, type) {
  // Atomic: a token can be used exactly once.
  return AuthToken.findOneAndUpdate(
    { tokenHash: sha256(token), type, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { returnDocument: 'after' },
  );
}

async function sendVerification(user) {
  const token = await issueToken(user, 'email_verify', 24 * 3600_000);
  const url = `${env.APP_URL}/verify-email?token=${token}`;
  // A delivery failure is already recorded as a system event by sendEmail. Swallow it so the response
  // is identical for every address (no enumeration) and a new account isn't left behind with a 5xx;
  // the person can request another link.
  await sendEmail({
    to: user.email,
    subject: 'Verify your email for Credetect',
    text: 'Confirm this email address to activate your Credetect account. The link expires in 24 hours.\n\nIf you did not create an account, ignore this email.',
    action: { label: 'Verify email', url },
  }).catch(() => {});
  return url;
}

const applyAdminRole = async (user) => {
  if (env.ADMIN_EMAILS.includes(user.email) && user.role !== 'admin') {
    user.role = 'admin';
    await user.save();
  }
};

router.get('/csrf', (req, res) => {
  const token = issueCsrf(res, req.cookies?.[CSRF_COOKIE]);
  res.json({ csrfToken: token });
});

router.get(
  '/me',
  ah(async (req, res) => {
    const csrfToken = issueCsrf(res, req.cookies?.[CSRF_COOKIE]);
    res.json({ user: req.user ? serializeUser(req.user) : null, csrfToken });
  }),
);

const GENERIC_REGISTER = 'If this email can be registered, we have sent a verification link. Check your inbox.';

router.post(
  '/register',
  ipLimit('register', 10),
  emailLimit('register-email', 3),
  validate(z.object({ email, password, acceptTerms: z.literal(true, { message: 'Accept the terms to continue' }) })),
  ah(async (req, res) => {
    const { email: addr, password: pw } = req.body;
    const existing = await User.findOne({ email: addr });
    if (existing) {
      // Do not reveal whether the address is registered.
      if (!existing.emailVerifiedAt) await sendVerification(existing);
      else
        await sendEmail({
          to: existing.email,
          subject: 'Someone tried to register with your email',
          text: 'A new Credetect account was requested with this email address, but you already have one. If this was you, sign in or reset your password. If not, you can ignore this email.',
          action: { label: 'Sign in', url: `${env.APP_URL}/login` },
        });
      return res.status(202).json({ message: GENERIC_REGISTER });
    }
    const user = await User.create({ email: addr, passwordHash: await bcrypt.hash(pw, BCRYPT_COST) });
    await audit(user._id, 'account.registered', { targetType: 'User', targetId: user._id });
    await sendVerification(user);
    res.status(202).json({ message: GENERIC_REGISTER });
  }),
);

router.post(
  '/verify-email',
  ipLimit('verify-email', 20),
  validate(z.object({ token: z.string().min(20).max(200) })),
  ah(async (req, res) => {
    const record = await consumeToken(req.body.token, 'email_verify');
    if (!record) throw new AppError(400, 'INVALID_TOKEN', 'This verification link is invalid or has expired.');
    const user = await User.findById(record.user);
    if (!user) throw new AppError(400, 'INVALID_TOKEN', 'This verification link is invalid or has expired.');
    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
      await user.save();
      await audit(user._id, 'account.email_verified', { targetType: 'User', targetId: user._id });
    }
    await applyAdminRole(user);
    const csrfToken = await createSession(res, user, req);
    res.json({ user: serializeUser(user), csrfToken });
  }),
);

router.post(
  '/resend-verification',
  ipLimit('resend-verification', 10),
  emailLimit('resend-verification-email', 3),
  validate(z.object({ email })),
  ah(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && !user.emailVerifiedAt) await sendVerification(user);
    res.status(202).json({ message: 'If the account exists and is unverified, a new link is on its way.' });
  }),
);

router.post(
  '/login',
  ipLimit('login', 20),
  emailLimit('login-email', 10, 15),
  validate(z.object({ email, password: z.string().min(1).max(128) })),
  ah(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select('+passwordHash +failedLogins +lockUntil');
    if (!user) {
      await bcrypt.compare(req.body.password, await getDummyHash()); // equalise timing
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in 15 minutes or reset your password.');
    }
    const ok = await bcrypt.compare(req.body.password, user.passwordHash);
    if (!ok) {
      user.failedLogins = (user.failedLogins || 0) + 1;
      if (user.failedLogins >= 8) {
        user.lockUntil = new Date(Date.now() + 15 * 60_000);
        user.failedLogins = 0;
        await audit(user._id, 'account.locked', { actor: 'system' });
      }
      await user.save();
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    if (!user.emailVerifiedAt) throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in. We can send a new link.');
    user.failedLogins = 0;
    user.lockUntil = null;
    await user.save();
    await applyAdminRole(user);
    const csrfToken = await createSession(res, user, req);
    await audit(user._id, 'account.login');
    res.json({ user: serializeUser(user), csrfToken });
  }),
);

router.post(
  '/logout',
  ah(async (req, res) => {
    await destroySession(req, res);
    res.json({ ok: true });
  }),
);

router.post(
  '/forgot-password',
  ipLimit('forgot', 10),
  emailLimit('forgot-email', 3),
  validate(z.object({ email })),
  ah(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user) {
      const token = await issueToken(user, 'password_reset', 3600_000);
      await sendEmail({
        to: user.email,
        subject: 'Reset your Credetect password',
        text: 'We received a request to reset your password. The link expires in 1 hour and can be used once.\n\nIf you did not request this, ignore this email. Your password will not change.',
        action: { label: 'Reset password', url: `${env.APP_URL}/reset-password?token=${token}` },
      });
    }
    res.status(202).json({ message: 'If an account exists for that email, a reset link is on its way.' });
  }),
);

router.post(
  '/reset-password',
  ipLimit('reset', 10),
  validate(z.object({ token: z.string().min(20).max(200), password })),
  ah(async (req, res) => {
    const record = await consumeToken(req.body.token, 'password_reset');
    if (!record) throw badRequest('This reset link is invalid or has expired.');
    const user = await User.findById(record.user).select('+passwordHash');
    if (!user) throw badRequest('This reset link is invalid or has expired.');
    user.passwordHash = await bcrypt.hash(req.body.password, BCRYPT_COST);
    user.failedLogins = 0;
    user.lockUntil = null;
    // Clicking the emailed link proves inbox control.
    if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    await user.save();
    await Session.deleteMany({ user: user._id });
    await audit(user._id, 'account.password_reset');
    await sendEmail({ to: user.email, subject: 'Your Credetect password was changed', text: 'Your password was just changed and all sessions were signed out. If this was not you, reset your password immediately.' });
    res.json({ message: 'Password updated. Sign in with your new password.' });
  }),
);

export default router;
