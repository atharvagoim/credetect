/** Normalisation and masking for personal identifiers. Never log raw values. */

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Normalise to E.164. Indian numbers are the default:
 *   9876543210, 09876543210, 919876543210, +91 98765-43210 -> +919876543210
 * Other countries must include the + prefix.
 */
export function normalizePhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  let e164 = null;
  if (raw.startsWith('+')) e164 = '+' + digits;
  else if (digits.length === 10) e164 = '+91' + digits;
  else if (digits.length === 11 && digits.startsWith('0')) e164 = '+91' + digits.slice(1);
  else if (digits.length === 12 && digits.startsWith('91')) e164 = '+' + digits;
  if (!e164 || !/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  if (e164.startsWith('+91') && !/^\+91[6-9]\d{9}$/.test(e164)) return null;
  return e164;
}

/** The national significant number (last 10 digits for India) used when matching page text. */
export function nationalNumber(e164) {
  const d = String(e164 || '').replace(/\D/g, '');
  return d.startsWith('91') && d.length === 12 ? d.slice(2) : d.slice(-10);
}

export function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return '••••';
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}${'•'.repeat(Math.max(2, user.length - head.length))}@${domain}`;
}

export function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return '••••';
  const cc = String(phone).startsWith('+91') ? '+91 ' : '+';
  return `${cc}••••• •${d.slice(-4)}`;
}

export function maskName(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .map((p) => (p ? p[0] + '•'.repeat(Math.max(1, p.length - 1)) : p))
    .join(' ');
}

export function mask(type, value) {
  if (type === 'email') return maskEmail(value);
  if (type === 'phone') return maskPhone(value);
  if (type === 'name') return maskName(value);
  return '••••';
}
