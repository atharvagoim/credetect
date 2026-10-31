import crypto from 'node:crypto';
import { billingConfigured, env } from '../config/env.js';
import { Payment, User } from '../models/index.js';
import { safeEqual } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { PLAN_CATALOG } from '../../shared/plans.js';
import { audit, recordEvent } from './events.js';

/** Plan catalogue (shared with the pricing UI). Family is announced but not sold. */
export const PLANS = Object.fromEntries(
  PLAN_CATALOG.map((p) => [p.id, p.id === 'free' ? { ...p, features: [`${env.FREE_SCANS_PER_30_DAYS} scans every 30 days`, ...p.features.slice(1)] } : p]),
);

const rzpAuth = () => 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');

async function razorpay(path, body) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: rzpAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    await recordEvent({ level: 'error', kind: 'billing', source: 'razorpay', message: `Razorpay ${path} failed with HTTP ${res.status}` });
    throw new AppError(502, 'BILLING_PROVIDER_ERROR', 'The payment provider is unavailable. Try again shortly.');
  }
  return res.json();
}

export async function createCheckout(user, planId) {
  if (!billingConfigured()) throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Payments are not enabled on this deployment yet.');
  const plan = PLANS[planId];
  if (!plan || plan.comingSoon || !plan.price) throw new AppError(400, 'BAD_PLAN', 'This plan is not available for purchase.');
  const notes = { userId: String(user._id), plan: plan.id };
  if (plan.id === 'monitor') {
    if (!env.RAZORPAY_MONITOR_PLAN_ID) throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Monthly subscriptions are not configured yet.');
    const sub = await razorpay('/subscriptions', { plan_id: env.RAZORPAY_MONITOR_PLAN_ID, total_count: 12, customer_notify: 1, notes });
    await Payment.create({ user: user._id, plan: plan.id, subscriptionId: sub.id, amount: plan.price });
    return { keyId: env.RAZORPAY_KEY_ID, subscriptionId: sub.id, plan: plan.id, name: plan.name };
  }
  const order = await razorpay('/orders', { amount: plan.price, currency: 'INR', receipt: `p_${Date.now()}`, notes });
  await Payment.create({ user: user._id, plan: plan.id, orderId: order.id, amount: plan.price });
  return { keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amount: plan.price, currency: 'INR', plan: plan.id, name: plan.name };
}

const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

async function activatePlan(userId, planId, { periodEnd, subscriptionId } = {}) {
  const plan = PLANS[planId];
  const end = periodEnd || new Date(Date.now() + plan.periodDays * 864e5);
  await User.updateOne(
    { _id: userId },
    { $set: { 'plan.tier': planId, 'plan.status': 'active', 'plan.currentPeriodEnd': end, ...(subscriptionId ? { 'plan.providerSubscriptionId': subscriptionId } : {}) } },
  );
  await audit(userId, 'billing.plan_activated', { actor: 'system', meta: { plan: planId } });
}

/** Client-returned checkout result. Signature verified with the key secret before anything changes. */
export async function verifyCheckout(user, { orderId, subscriptionId, paymentId, signature }) {
  if (!billingConfigured()) throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Payments are not enabled.');
  const payload = orderId ? `${orderId}|${paymentId}` : `${paymentId}|${subscriptionId}`;
  if (!safeEqual(hmacHex(env.RAZORPAY_KEY_SECRET, payload), signature)) throw new AppError(400, 'BAD_SIGNATURE', 'Payment could not be verified.');
  const payment = await Payment.findOne({ user: user._id, ...(orderId ? { orderId } : { subscriptionId }) });
  if (!payment) throw new AppError(404, 'NOT_FOUND', 'Payment not found');
  if (payment.status !== 'paid') {
    payment.status = 'paid';
    payment.paymentId = paymentId;
    await payment.save();
    await activatePlan(user._id, payment.plan, { subscriptionId });
  }
  return { plan: payment.plan };
}

/** Webhook: signature over the raw body with the webhook secret; idempotent per event id. */
export async function handleWebhook(rawBody, signature, eventId) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Webhook secret not configured');
  if (!signature || !safeEqual(hmacHex(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature)) throw new AppError(400, 'BAD_SIGNATURE', 'Invalid signature');
  const event = JSON.parse(rawBody.toString('utf8'));
  const type = event.event;
  const pay = event.payload?.payment?.entity;
  const sub = event.payload?.subscription?.entity;

  let record = null;
  if (sub?.id) record = await Payment.findOne({ subscriptionId: sub.id });
  else if (pay?.order_id) record = await Payment.findOne({ orderId: pay.order_id });
  if (!record) return { ignored: true };
  if (eventId && record.eventIds.includes(eventId)) return { duplicate: true };
  record.eventIds.push(eventId || `${type}:${Date.now()}`);

  if ((type === 'payment.captured' || type === 'order.paid') && pay) {
    record.status = 'paid';
    record.paymentId = pay.id;
    if (record.user) await activatePlan(record.user, record.plan);
  } else if ((type === 'subscription.activated' || type === 'subscription.charged') && sub) {
    record.status = 'paid';
    if (record.user) await activatePlan(record.user, 'monitor', { periodEnd: sub.current_end ? new Date(sub.current_end * 1000) : undefined, subscriptionId: sub.id });
  } else if (['subscription.cancelled', 'subscription.halted', 'subscription.completed'].includes(type) && sub) {
    record.status = 'cancelled';
    if (record.user) await User.updateOne({ _id: record.user }, { $set: { 'plan.status': 'cancelled' } });
  } else if (type === 'payment.failed') {
    record.status = 'failed';
  }
  await record.save();
  return { ok: true };
}

/** Downgrade plans whose paid period has ended. Run from cron. */
export async function expirePlans() {
  const r = await User.updateMany(
    { 'plan.tier': { $ne: 'free' }, 'plan.currentPeriodEnd': { $lt: new Date() } },
    { $set: { 'plan.tier': 'free', 'plan.status': 'active', 'plan.currentPeriodEnd': null } },
  );
  await User.updateMany({ 'plan.tier': 'free', 'monitoring.frequency': 'weekly' }, { $set: { 'monitoring.frequency': 'monthly' } });
  return r.modifiedCount;
}
