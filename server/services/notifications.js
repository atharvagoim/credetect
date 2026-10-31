import { env } from '../config/env.js';
import { Notification } from '../models/index.js';
import { signPayload } from '../utils/crypto.js';
import { sendEmail } from './messaging.js';

export const unsubscribeUrl = (userId) => `${env.APP_URL}/api/notifications/unsubscribe?token=${encodeURIComponent(signPayload({ u: String(userId), p: 'unsub' }))}`;

/**
 * Create an in-app notification and, if the user's preferences allow, email it.
 * Emails contain no personal identifiers; they link back to the app.
 */
export async function notify(user, { type, title, body, link, pref }) {
  const n = await Notification.create({ user: user._id, type, title, body, link });
  const prefs = user.notificationPrefs || {};
  const wantsEmail = prefs.email !== false && (!pref || prefs[pref] !== false);
  if (wantsEmail) {
    try {
      const r = await sendEmail({
        to: user.email,
        subject: title,
        text: `${body}\n\nManage notification preferences in Settings, or unsubscribe from all emails: ${unsubscribeUrl(user._id)}`,
        action: link ? { label: 'Open Credetect', url: `${env.APP_URL}${link}` } : undefined,
      });
      if (r.delivered) await Notification.updateOne({ _id: n._id }, { $set: { emailedAt: new Date() } });
    } catch {
      /* in-app notification still exists */
    }
  }
  return n;
}
