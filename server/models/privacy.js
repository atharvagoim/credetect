import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A phone number or email address the user has proven they control. Raw value encrypted at rest. */
const contactSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['email', 'phone'], required: true },
    valueEnc: { type: String, required: true },
    valueHash: { type: String, required: true },
    masked: { type: String, required: true },
    verifiedAt: { type: Date, default: null },
    scanEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);
contactSchema.index({ user: 1, valueHash: 1 }, { unique: true });

export const CONSENT_SCOPES = ['data_processing', 'scanning', 'monitoring', 'removal_submission'];
export const CONSENT_VERSION = '2026-10-01';

/** Append-only consent ledger. Revocation sets revokedAt; records are never edited otherwise. */
const consentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, enum: CONSENT_SCOPES, required: true },
    version: { type: String, required: true },
    textHash: { type: String, required: true },
    subjectRef: { type: String, default: null },
    grantedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
consentSchema.index({ user: 1, scope: 1, revokedAt: 1 });

export const VerifiedContact = mongoose.models.VerifiedContact || mongoose.model('VerifiedContact', contactSchema);
export const ConsentRecord = mongoose.models.ConsentRecord || mongoose.model('ConsentRecord', consentSchema);
