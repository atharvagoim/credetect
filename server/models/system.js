import mongoose from 'mongoose';
import { env } from '../config/env.js';

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['new_findings', 'scan_failed', 'removal_update', 'follow_up', 'account', 'billing'], required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 1000 },
    link: { type: String, maxlength: 300 },
    readAt: { type: Date, default: null },
    emailedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

/**
 * Audit trail for consent, approvals and removal actions.
 * `meta` must never contain raw contact values, tokens or request bodies.
 */
const auditSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userRef: { type: String, default: null }, // keyed hash, survives account deletion
    actor: { type: String, enum: ['user', 'system', 'admin'], default: 'user' },
    action: { type: String, required: true },
    targetType: String,
    targetId: String,
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ user: 1, createdAt: -1 });
auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * env.AUDIT_RETENTION_DAYS });

/** Operational events for the admin console: integration errors, rate-limit and abuse alerts. No PII. */
const systemEventSchema = new Schema(
  {
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    kind: { type: String, enum: ['adapter_error', 'job_failed', 'rate_limit', 'abuse', 'email_error', 'billing', 'config'], required: true },
    source: String,
    message: { type: String, maxlength: 500 },
    meta: { type: Schema.Types.Mixed, default: {} },
    acknowledgedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
systemEventSchema.index({ kind: 1, createdAt: -1 });
systemEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    provider: { type: String, default: 'razorpay' },
    plan: { type: String, enum: ['cleanup', 'monitor'], required: true },
    orderId: String,
    subscriptionId: String,
    paymentId: String,
    amount: Number,
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['created', 'paid', 'failed', 'cancelled'], default: 'created' },
    eventIds: { type: [String], default: [] },
  },
  { timestamps: true },
);
paymentSchema.index({ orderId: 1 }, { sparse: true });
paymentSchema.index({ subscriptionId: 1 }, { sparse: true });
paymentSchema.index({ user: 1, createdAt: -1 });

export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);
export const SystemEvent = mongoose.models.SystemEvent || mongoose.model('SystemEvent', systemEventSchema);
export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
