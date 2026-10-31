import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Server-side session. Only a SHA-256 of the cookie token is stored. */
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, default: Date.now },
    userAgent: { type: String, maxlength: 200, default: '' },
  },
  { timestamps: true },
);
sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ user: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** One-time tokens and OTP codes. Only hashes are stored. */
const authTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['email_verify', 'password_reset', 'contact_verify'], required: true },
    tokenHash: { type: String, required: true },
    contact: { type: Schema.Types.ObjectId, ref: 'VerifiedContact', default: null },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
authTokenSchema.index({ tokenHash: 1, type: 1 });
authTokenSchema.index({ user: 1, type: 1 });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Fixed-window counters shared across serverless instances. */
const rateLimitSchema = new Schema({
  key: { type: String, required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
rateLimitSchema.index({ key: 1 }, { unique: true });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
export const AuthToken = mongoose.models.AuthToken || mongoose.model('AuthToken', authTokenSchema);
export const RateLimitBucket = mongoose.models.RateLimitBucket || mongoose.model('RateLimitBucket', rateLimitSchema);
