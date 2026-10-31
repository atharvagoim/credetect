import { env } from '../config/env.js';
import { AdapterRateLimited } from './hibp.js';

/**
 * REAL ADAPTER: XposedOrNot (https://xposedornot.com), a free breach lookup that needs no API key.
 * Like HIBP, we only query addresses the user has verified they own, and breach data cannot be
 * "removed", so findings are non-removable and the UI explains protective next steps instead.
 */
const MAX_BREACHES_PER_EMAIL = 25;

export const xposedOrNotAdapter = {
  key: 'xposedornot',
  name: 'XposedOrNot (data breaches)',
  description: 'Checks verified email addresses against publicly disclosed data breaches using the free XposedOrNot API.',
  kind: 'breach',
  isDemo: false,
  dataTypes: ['email'],
  supportsVerification: false,
  defaultRemoval: {
    channel: 'none',
    instructions:
      'Breached data is held by third parties and cannot be deleted by a removal request. Change the password for this service and anywhere you reused it, enable two-factor authentication, and watch for phishing that references this breach.',
  },
  // Free and keyless, so it is always available; HIBP stays the richer option when a key is set.
  isAvailable: () => ({ ok: true }),

  async search({ identity, signal, fetchImpl = fetch }) {
    const results = [];
    for (const c of identity.contacts.filter((x) => x.type === 'email')) {
      const res = await fetchImpl(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(c.value)}`, {
        headers: { 'user-agent': env.SCAN_USER_AGENT },
        signal,
      });
      if (res.status === 404) continue; // not found in any breach
      if (res.status === 429) throw new AdapterRateLimited(Number(res.headers.get('retry-after')) || 10);
      if (!res.ok) throw new Error(`XposedOrNot responded with HTTP ${res.status}`);
      const body = await res.json().catch(() => ({}));
      if (body.Error) continue; // "Not found" is returned as a body for clean addresses
      const names = (Array.isArray(body.breaches) ? body.breaches.flat() : []).filter((n) => typeof n === 'string');
      for (const name of names.slice(0, MAX_BREACHES_PER_EMAIL)) {
        results.push({
          sourceName: `Breach: ${name}`,
          sourceUrl: 'https://xposedornot.com/',
          domain: 'xposedornot.com',
          dataType: 'email',
          contactId: c.id,
          confidence: 0.8,
          matchedValueMasked: c.masked,
          evidenceSummary: `${c.masked} appears in the ${name} data breach, according to XposedOrNot.${names.length > MAX_BREACHES_PER_EMAIL ? ` Showing ${MAX_BREACHES_PER_EMAIL} of ${names.length} breaches.` : ''}`,
          category: 'breach',
          removable: false,
          externalId: name,
        });
      }
    }
    return results;
  },
};
