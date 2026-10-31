import { CONSENT_TEXT, CONSENT_VERSION } from '../../shared/consents.js';
import { ConsentRecord, User } from '../models/index.js';
import { sha256 } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { audit } from './events.js';

export async function grantConsent(userId, scope, { subjectRef = null } = {}) {
  const textHash = sha256(CONSENT_TEXT[scope]);
  if (!subjectRef) {
    const existing = await ConsentRecord.findOne({ user: userId, scope, revokedAt: null, version: CONSENT_VERSION, subjectRef: null });
    if (existing) return existing;
  }
  const rec = await ConsentRecord.create({ user: userId, scope, version: CONSENT_VERSION, textHash, subjectRef });
  await audit(userId, 'consent.granted', { targetType: 'ConsentRecord', targetId: rec._id, meta: { scope, version: CONSENT_VERSION, subjectRef } });
  return rec;
}

export async function revokeConsent(userId, scope) {
  const { modifiedCount } = await ConsentRecord.updateMany({ user: userId, scope, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (modifiedCount) await audit(userId, 'consent.revoked', { meta: { scope } });
  // Revoking scanning or processing consent stops monitoring too.
  if (['scanning', 'data_processing', 'monitoring'].includes(scope)) {
    await User.updateOne({ _id: userId }, { $set: { 'monitoring.enabled': false, 'monitoring.nextRunAt': null } });
  }
  if (scope === 'data_processing') await revokeConsent(userId, 'scanning');
  return modifiedCount;
}

export async function activeScopes(userId) {
  const recs = await ConsentRecord.find({ user: userId, revokedAt: null, subjectRef: null }).lean();
  return [...new Set(recs.map((r) => r.scope))];
}

export async function requireConsent(userId, scopes) {
  const active = await activeScopes(userId);
  const missing = scopes.filter((s) => !active.includes(s));
  if (missing.length) throw new AppError(403, 'CONSENT_REQUIRED', 'Consent is required before we can do this.', { missing });
}
