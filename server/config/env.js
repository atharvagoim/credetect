import crypto from 'node:crypto';

const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const int = (v, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test' || bool(process.env.VITEST);

const warnings = [];
const missing = [];

function secret(name) {
  const v = process.env[name];
  if (v && v.length >= 32) return v;
  if (isProd) {
    missing.push(name);
    return null;
  }
  warnings.push(`${name} not set; using an ephemeral development value`);
  // Stable for the life of the process only. Fine for dev and tests.
  globalThis.__pardaDevSecrets ??= {};
  globalThis.__pardaDevSecrets[name] ??= crypto.randomBytes(32).toString('hex');
  return globalThis.__pardaDevSecrets[name];
}

const appUrl = (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:5173')).replace(/\/$/, '');

export const env = {
  NODE_ENV,
  isProd,
  isTest,
  APP_URL: appUrl,
  APP_NAME: 'Credetect',
  MONGODB_URI: process.env.MONGODB_URI || '',
  DATA_ENCRYPTION_KEY: secret('DATA_ENCRYPTION_KEY'),
  HMAC_SECRET: secret('HMAC_SECRET'),
  SESSION_TTL_DAYS: int(process.env.SESSION_TTL_DAYS, 7),
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  CRON_SECRET: process.env.CRON_SECRET || '',

  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: int(process.env.SMTP_PORT, 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_SECURE: bool(process.env.SMTP_SECURE, false),
  MAIL_FROM: process.env.MAIL_FROM || 'Credetect <no-reply@localhost>',

  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_FROM: process.env.TWILIO_FROM || '',
  // Free alternative: TextBee turns your own Android phone into an SMS gateway (https://textbee.dev).
  TEXTBEE_API_KEY: process.env.TEXTBEE_API_KEY || '',
  TEXTBEE_DEVICE_ID: process.env.TEXTBEE_DEVICE_ID || '',

  HIBP_API_KEY: process.env.HIBP_API_KEY || '',
  SCAN_USER_AGENT: process.env.SCAN_USER_AGENT || 'CredetectPrivacyBot/1.0 (+personal data removal service)',

  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  RAZORPAY_MONITOR_PLAN_ID: process.env.RAZORPAY_MONITOR_PLAN_ID || '',

  FINDING_RETENTION_DAYS: int(process.env.FINDING_RETENTION_DAYS, 365),
  DISMISSED_RETENTION_DAYS: int(process.env.DISMISSED_RETENTION_DAYS, 30),
  AUDIT_RETENTION_DAYS: int(process.env.AUDIT_RETENTION_DAYS, 365),
  FREE_SCANS_PER_30_DAYS: int(process.env.FREE_SCANS_PER_30_DAYS, 5),

  warnings,
  missing,
};

if (isProd && !env.MONGODB_URI) missing.push('MONGODB_URI');
if (isProd && !process.env.APP_URL) warnings.push('APP_URL not set; falling back to the Vercel production URL');
if (!env.SMTP_HOST) warnings.push('SMTP not configured; verification and notification emails will not be delivered');

export const smtpConfigured = () => Boolean(env.SMTP_HOST && env.SMTP_USER);
export const twilioConfigured = () => Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
export const textbeeConfigured = () => Boolean(env.TEXTBEE_API_KEY && env.TEXTBEE_DEVICE_ID);
export const smsConfigured = () => twilioConfigured() || textbeeConfigured();
export const billingConfigured = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
