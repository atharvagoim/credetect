import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { CONSENT_TEXT, CONSENT_VERSION } from '../../shared/consents.js';
import { destroySession } from '../middleware/auth.js';
import { validate, objectId } from '../middleware/common.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  AuditLog,
  AuthToken,
  ConsentRecord,
  CONSENT_SCOPES,
  ExposureFinding,
  Notification,
  Payment,
  RemovalRequest,
  ScanJob,
  Session,
  User,
  VerifiedContact,
} from '../models/index.js';
import { decrypt, encrypt, hmac, randomCode, sha256 } from '../utils/crypto.js';
import { mask, normalizeEmail, normalizePhone } from '../utils/pii.js';
import { ah, AppError, badRequest, notFound } from '../utils/errors.js';
import { activeScopes, grantConsent, revokeConsent } from '../services/consent.js';
import { audit } from '../services/events.js';
import { smsConfigured } from '../config/env.js';
import { sendEmail, sendSms } from '../services/messaging.js';
import { serializeContact, serializeFinding, serializeRemoval, serializeUser } from '../services/serializers.js';

const router = Router();

async function profilePayload(user) {
  const contacts = await VerifiedContact.find({ user: user._id }).sort({ createdAt: 1 });
  return {
    user: serializeUser(user),
    fullName: user.fullNameEnc ? decrypt(user.fullNameEnc) : '',
    scanDataTypes: user.scanDataTypes,
    contacts: contacts.map(serializeContact),
    consents: await activeScopes(user._id),
    consentVersion: CONSENT_VERSION,
    monitoring: user.monitoring,
    notificationPrefs: user.notificationPrefs,
  };
}

router.get('/profile', ah(async (req, res) => res.json(await profilePayload(req.user))));

router.patch(
  '/profile',
  validate(
    z
      .object({
        fullName: z.string().trim().min(2, 'Enter your full name').max(120).regex(/^[\p{L}\p{M} .'-]+$/u, 'Use letters only').optional(),
        scanDataTypes: z.array(z.enum(['email', 'phone', 'name'])).min(1, 'Pick at least one data type').max(3).optional(),
        notificationPrefs: z
          .object({ email: z.boolean(), newFindings: z.boolean(), removalUpdates: z.boolean(), productUpdates: z.boolean() })
          .partial()
          .optional(),
        completeOnboarding: z.literal(true).optional(),
      })
      .strict(),
  ),
  ah(async (req, res) => {
    const u = req.user;
    const { fullName, scanDataTypes, notificationPrefs, completeOnboarding } = req.body;
    if (fullName !== undefined) u.fullNameEnc = encrypt(fullName);
    if (scanDataTypes) u.scanDataTypes = [...new Set(scanDataTypes)];
    if (notificationPrefs) Object.assign(u.notificationPrefs, notificationPrefs);
    if (completeOnboarding) {
      const scopes = await activeScopes(u._id);
      if (!scopes.includes('data_processing') || !scopes.includes('scanning')) throw new AppError(400, 'CONSENT_REQUIRED', 'Give consent before finishing setup.');
      const verified = await VerifiedContact.countDocuments({ user: u._id, verifiedAt: { $ne: null } });
      if (!verified && !u.fullNameEnc) throw badRequest('Add and verify at least one contact detail.');
      u.onboardingCompletedAt ??= new Date();
    }
    await u.save();
    await audit(u._id, 'profile.updated', { meta: { fields: Object.keys(req.body) } });
    res.json(await profilePayload(u));
  }),
);

// ---------- Contacts ----------

async function sendContactCode(user, contact, value) {
  const code = randomCode();
  await AuthToken.deleteMany({ user: user._id, type: 'contact_verify', contact: contact._id });
  await AuthToken.create({ user: user._id, type: 'contact_verify', contact: contact._id, tokenHash: sha256(`${contact._id}:${code}`), expiresAt: new Date(Date.now() + 10 * 60_000) });
  const text = `Your Credetect verification code is ${code}. It expires in 10 minutes. Never share this code.`;
  if (contact.type === 'email') return sendEmail({ to: value, subject: `Credetect code: ${code}`, text });
  // No SMS provider: phone numbers are confirmed with a code sent to the account's verified email.
  // This shows the account holder entered the number; it does not prove they control the phone.
  if (!smsConfigured()) {
    return sendEmail({
      to: user.email,
      subject: `Credetect code: ${code}`,
      text: `Your Credetect code to confirm the phone number ${contact.masked} is ${code}. It expires in 10 minutes. Never share this code.`,
    });
  }
  return sendSms({ to: value, text });
}

const contactLimit = rateLimit({ name: 'contact-send', windowMs: 3600_000, max: 8, by: 'user' });

router.post(
  '/contacts',
  contactLimit,
  validate(z.object({ type: z.enum(['email', 'phone']), value: z.string().trim().min(3).max(254) })),
  ah(async (req, res) => {
    const { type } = req.body;
    const value = type === 'email' ? normalizeEmail(req.body.value) : normalizePhone(req.body.value);
    if (!value || (type === 'email' && !z.string().email().safeParse(value).success)) {
      throw badRequest(type === 'phone' ? 'Enter a valid mobile number, e.g. +91 98765 43210' : 'Enter a valid email address');
    }
    if ((await VerifiedContact.countDocuments({ user: req.user._id, type })) >= 3) throw badRequest(`You can add up to 3 ${type === 'phone' ? 'phone numbers' : 'email addresses'}.`);
    const valueHash = hmac(`${type}:${value}`);
    if (await VerifiedContact.exists({ user: req.user._id, valueHash })) throw new AppError(409, 'CONFLICT', 'You have already added this.');
    const contact = await VerifiedContact.create({ user: req.user._id, type, valueEnc: encrypt(value), valueHash, masked: mask(type, value) });
    // The account email is already proven by the email-verification step.
    if (type === 'email' && value === req.user.email) {
      contact.verifiedAt = new Date();
      await contact.save();
    } else {
      await sendContactCode(req.user, contact, value);
    }
    await audit(req.user._id, 'contact.added', { targetType: 'VerifiedContact', targetId: contact._id, meta: { type, masked: contact.masked } });
    res.status(201).json({ contact: serializeContact(contact), codeSent: !contact.verifiedAt });
  }),
);

router.post(
  '/contacts/:id/verify',
  rateLimit({ name: 'contact-verify', windowMs: 15 * 60_000, max: 15, by: 'user' }),
  validate(z.object({ id: objectId }), 'params'),
  validate(z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') })),
  ah(async (req, res) => {
    const contact = await VerifiedContact.findOne({ _id: req.params.id, user: req.user._id });
    if (!contact) throw notFound('Contact not found');
    if (contact.verifiedAt) return res.json({ contact: serializeContact(contact) });
    const token = await AuthToken.findOne({ user: req.user._id, type: 'contact_verify', contact: contact._id, usedAt: null, expiresAt: { $gt: new Date() } });
    if (!token) throw new AppError(400, 'CODE_EXPIRED', 'This code has expired. Request a new one.');
    if (token.attempts >= 5) throw new AppError(400, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
    if (token.tokenHash !== sha256(`${contact._id}:${req.body.code}`)) {
      token.attempts += 1;
      await token.save();
      throw new AppError(400, 'INVALID_CODE', 'That code is not correct.');
    }
    token.usedAt = new Date();
    await token.save();
    contact.verifiedAt = new Date();
    await contact.save();
    await audit(req.user._id, 'contact.verified', { targetType: 'VerifiedContact', targetId: contact._id, meta: { type: contact.type } });
    res.json({ contact: serializeContact(contact) });
  }),
);

router.post(
  '/contacts/:id/resend',
  contactLimit,
  validate(z.object({ id: objectId }), 'params'),
  ah(async (req, res) => {
    const contact = await VerifiedContact.findOne({ _id: req.params.id, user: req.user._id });
    if (!contact) throw notFound('Contact not found');
    if (contact.verifiedAt) throw badRequest('Already verified');
    await sendContactCode(req.user, contact, decrypt(contact.valueEnc));
    res.json({ ok: true });
  }),
);

router.patch(
  '/contacts/:id',
  validate(z.object({ id: objectId }), 'params'),
  validate(z.object({ scanEnabled: z.boolean() })),
  ah(async (req, res) => {
    const contact = await VerifiedContact.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { $set: { scanEnabled: req.body.scanEnabled } }, { returnDocument: 'after' });
    if (!contact) throw notFound('Contact not found');
    res.json({ contact: serializeContact(contact) });
  }),
);

router.delete(
  '/contacts/:id',
  validate(z.object({ id: objectId }), 'params'),
  ah(async (req, res) => {
    const contact = await VerifiedContact.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!contact) throw notFound('Contact not found');
    await AuthToken.deleteMany({ contact: contact._id });
    await audit(req.user._id, 'contact.removed', { targetType: 'VerifiedContact', targetId: contact._id, meta: { type: contact.type } });
    res.json({ ok: true });
  }),
);

// ---------- Consent ----------

router.get(
  '/consents',
  ah(async (req, res) => {
    const records = await ConsentRecord.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({
      version: CONSENT_VERSION,
      texts: CONSENT_TEXT,
      active: await activeScopes(req.user._id),
      history: records.map((r) => ({ id: String(r._id), scope: r.scope, version: r.version, grantedAt: r.grantedAt, revokedAt: r.revokedAt, subjectRef: r.subjectRef })),
    });
  }),
);

const grantable = CONSENT_SCOPES.filter((s) => s !== 'removal_submission');

router.post(
  '/consents',
  validate(z.object({ scopes: z.array(z.enum(grantable)).min(1), version: z.literal(CONSENT_VERSION, { message: 'The consent text has changed. Refresh and review it again.' }) })),
  ah(async (req, res) => {
    if (req.body.scopes.some((s) => s !== 'data_processing')) {
      const active = await activeScopes(req.user._id);
      if (!active.includes('data_processing') && !req.body.scopes.includes('data_processing')) throw badRequest('Data processing consent is required first.');
    }
    for (const scope of req.body.scopes) await grantConsent(req.user._id, scope);
    res.json({ active: await activeScopes(req.user._id) });
  }),
);

router.delete(
  '/consents/:scope',
  validate(z.object({ scope: z.enum(grantable) }), 'params'),
  ah(async (req, res) => {
    await revokeConsent(req.user._id, req.params.scope);
    res.json({ active: await activeScopes(req.user._id) });
  }),
);

// ---------- Export & deletion ----------

router.get(
  '/profile/export',
  rateLimit({ name: 'export', windowMs: 3600_000, max: 5, by: 'user' }),
  ah(async (req, res) => {
    const uid = req.user._id;
    const [contacts, consents, scans, findings, removals, notifications, activity] = await Promise.all([
      VerifiedContact.find({ user: uid }),
      ConsentRecord.find({ user: uid }).lean(),
      ScanJob.find({ user: uid }).lean(),
      ExposureFinding.find({ user: uid }),
      RemovalRequest.find({ user: uid }),
      Notification.find({ user: uid }).lean(),
      AuditLog.find({ user: uid }).sort({ createdAt: -1 }).limit(1000).lean(),
    ]);
    await audit(uid, 'account.exported');
    res.set('Content-Disposition', `attachment; filename="credetect-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.set('Cache-Control', 'no-store');
    res.json({
      exportedAt: new Date().toISOString(),
      account: { email: req.user.email, createdAt: req.user.createdAt, plan: req.user.plan, notificationPrefs: req.user.notificationPrefs, monitoring: req.user.monitoring },
      fullName: req.user.fullNameEnc ? decrypt(req.user.fullNameEnc) : '',
      contacts: contacts.map((c) => ({ type: c.type, value: decrypt(c.valueEnc), verifiedAt: c.verifiedAt, addedAt: c.createdAt })),
      consents: consents.map(({ scope, version, grantedAt, revokedAt, subjectRef }) => ({ scope, version, grantedAt, revokedAt, subjectRef })),
      scans: scans.map(({ _id, status, trigger, sources, createdAt, finishedAt }) => ({ id: String(_id), status, trigger, sources, createdAt, finishedAt })),
      findings: findings.map(serializeFinding),
      removalRequests: removals.map((r) => serializeRemoval(r, { includeBody: true })),
      notifications: notifications.map(({ type, title, body, createdAt, readAt }) => ({ type, title, body, createdAt, readAt })),
      activity: activity.map(({ action, createdAt, meta }) => ({ action, createdAt, meta })),
    });
  }),
);

router.delete(
  '/profile',
  rateLimit({ name: 'delete-account', windowMs: 3600_000, max: 5, by: 'user' }),
  validate(z.object({ password: z.string().min(1).max(128), confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }) })),
  ah(async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await bcrypt.compare(req.body.password, user.passwordHash))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Password is incorrect.');
    const uid = user._id;
    const email = user.email;
    await Promise.all([
      VerifiedContact.deleteMany({ user: uid }),
      ConsentRecord.deleteMany({ user: uid }),
      ScanJob.deleteMany({ user: uid }),
      ExposureFinding.deleteMany({ user: uid }),
      RemovalRequest.deleteMany({ user: uid }),
      Notification.deleteMany({ user: uid }),
      AuthToken.deleteMany({ user: uid }),
      Session.deleteMany({ user: uid }),
    ]);
    // Payment records are kept (with the user link removed) for tax/accounting obligations.
    await Payment.updateMany({ user: uid }, { $set: { user: null } }, { strict: false });
    // Audit trail is kept for the retention period, detached from the account (userRef is a keyed hash).
    await AuditLog.updateMany({ user: uid }, { $set: { user: null, meta: {} } });
    await audit(null, 'account.deleted', { actor: 'system', meta: {} });
    await User.deleteOne({ _id: uid });
    await destroySession(req, res);
    await sendEmail({ to: email, subject: 'Your Credetect account was deleted', text: 'Your account and personal data have been deleted. Removal requests already sent to websites cannot be recalled. Anonymised audit records are retained as described in our privacy policy.' }).catch(() => {});
    res.json({ ok: true });
  }),
);

export default router;
