import mongoose from 'mongoose';

const { Schema } = mongoose;

export const DATA_TYPES = ['email', 'phone', 'name'];
export const PLAN_TIERS = ['free', 'cleanup', 'monitor'];

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    emailVerifiedAt: { type: Date, default: null },
    fullNameEnc: { type: String, default: '' },
    scanDataTypes: { type: [{ type: String, enum: DATA_TYPES }], default: ['email', 'phone', 'name'] },
    onboardingCompletedAt: { type: Date, default: null },
    plan: {
      tier: { type: String, enum: PLAN_TIERS, default: 'free' },
      status: { type: String, enum: ['active', 'past_due', 'cancelled', 'none'], default: 'active' },
      currentPeriodEnd: { type: Date, default: null },
      providerSubscriptionId: { type: String, default: null },
    },
    monitoring: {
      enabled: { type: Boolean, default: false },
      frequency: { type: String, enum: ['weekly', 'monthly'], default: 'monthly' },
      nextRunAt: { type: Date, default: null },
      lastRunAt: { type: Date, default: null },
    },
    notificationPrefs: {
      email: { type: Boolean, default: true },
      newFindings: { type: Boolean, default: true },
      removalUpdates: { type: Boolean, default: true },
      productUpdates: { type: Boolean, default: false },
    },
    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ 'monitoring.enabled': 1, 'monitoring.nextRunAt': 1 });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
