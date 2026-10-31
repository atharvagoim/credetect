import { mask, nationalNumber } from '../utils/pii.js';

/** Turn HTML into plain visible text. Script/style content removed. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#64;|&commat;/gi, '@')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const deobfuscate = (text) =>
  text
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, '@')
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.');

/**
 * Match a user's identity against page text.
 * Returns findings with masked evidence only; raw page text is never stored.
 */
export function matchIdentity(text, identity) {
  const out = [];
  const lower = deobfuscate(text).toLowerCase();

  for (const c of identity.contacts) {
    if (c.type === 'email') {
      if (lower.includes(c.value.toLowerCase())) {
        out.push({ dataType: 'email', contactId: c.id, confidence: 0.95, matchedValueMasked: c.masked, evidence: `Email address ${c.masked} appears in the page text.` });
      }
    } else if (c.type === 'phone') {
      const target = nationalNumber(c.value);
      const runs = text.match(/\+?\d[\d\s\-().]{7,20}\d/g) || [];
      const hit = runs.some((r) => {
        const d = r.replace(/\D/g, '');
        return d.length >= 10 && d.slice(-10) === target;
      });
      if (hit) out.push({ dataType: 'phone', contactId: c.id, confidence: 0.9, matchedValueMasked: c.masked, evidence: `Phone number ${c.masked} appears in the page text.` });
    }
  }

  const name = identity.fullName?.trim();
  if (name && name.split(/\s+/).length >= 2) {
    const pattern = new RegExp(`(^|[^\\p{L}])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}($|[^\\p{L}])`, 'u');
    if (pattern.test(lower)) {
      // A name alone is weak evidence (names are shared). Boost when a contact also matched.
      const corroborated = out.length > 0;
      out.push({
        dataType: 'name',
        contactId: null,
        confidence: corroborated ? 0.85 : 0.4,
        matchedValueMasked: mask('name', name),
        evidence: corroborated ? 'Your full name appears on the same page as your contact details.' : 'Your full name appears in the page text. Names can be shared by others, so review before requesting removal.',
      });
    }
  }
  return out;
}
