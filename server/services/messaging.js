import nodemailer from 'nodemailer';
import { env, smtpConfigured, textbeeConfigured, twilioConfigured } from '../config/env.js';
import { recordEvent } from './events.js';

let transport;
function getTransport() {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transport;
}

// Test hook: lets integration tests capture outgoing mail.
export const testHooks = { sent: [] };

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function htmlLayout(text, action) {
  const paragraphs = text
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 16px">${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escape(action.url)}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:12px 18px;text-decoration:none;font-family:monospace;font-size:13px">${escape(action.label)}</a></p>`
    : '';
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0a0a0a;max-width:520px;margin:0 auto;padding:32px 24px;border:1px solid #e5e5e5"><p style="font-family:monospace;font-size:12px;letter-spacing:.08em;margin:0 0 24px">CREDETECT</p>${paragraphs}${button}</div>`;
}

/**
 * Send an email through SMTP. Returns { delivered: boolean, via: 'smtp'|'none' }.
 */
export async function sendEmail({ to, subject, text, action, replyTo }) {
  const fullText = action ? `${text}\n\n${action.label}: ${action.url}` : text;
  if (env.isTest) {
    testHooks.sent.push({ channel: 'email', to, subject, text: fullText });
    return { delivered: true, via: 'test' };
  }
  if (smtpConfigured()) {
    try {
      await getTransport().sendMail({ from: env.MAIL_FROM, to, subject, text: fullText, html: htmlLayout(text, action), replyTo });
      return { delivered: true, via: 'smtp' };
    } catch (err) {
      await recordEvent({ level: 'error', kind: 'email_error', source: 'smtp', message: err.message });
      throw Object.assign(new Error('Email delivery failed'), { status: 502, code: 'EMAIL_FAILED' });
    }
  }
  await recordEvent({ level: 'warn', kind: 'config', source: 'smtp', message: 'Email not sent: SMTP not configured' });
  return { delivered: false, via: 'none' };
}

/** SMS through TextBee or Twilio when configured. */
export async function sendSms({ to, text }) {
  if (env.isTest) {
    testHooks.sent.push({ channel: 'sms', to, text });
    return { delivered: true, via: 'test' };
  }
  if (textbeeConfigured() && !twilioConfigured()) {
    const res = await fetch(`https://api.textbee.dev/api/v1/gateway/devices/${encodeURIComponent(env.TEXTBEE_DEVICE_ID)}/send-sms`, {
      method: 'POST',
      headers: { 'x-api-key': env.TEXTBEE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: [to], message: text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      await recordEvent({ level: 'error', kind: 'adapter_error', source: 'textbee', message: `SMS failed with HTTP ${res.status}` });
      throw Object.assign(new Error('SMS delivery failed'), { status: 502, code: 'SMS_FAILED' });
    }
    return { delivered: true, via: 'sms' };
  }
  if (twilioConfigured()) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      await recordEvent({ level: 'error', kind: 'adapter_error', source: 'twilio', message: `SMS failed with HTTP ${res.status}` });
      throw Object.assign(new Error('SMS delivery failed'), { status: 502, code: 'SMS_FAILED' });
    }
    return { delivered: true, via: 'sms' };
  }
  return { delivered: false, via: 'none' };
}
