import { env } from '../config/env.js';

/**
 * REAL ADAPTER: Have I Been Pwned (https://haveibeenpwned.com/API/v3).
 * HIBP explicitly offers a paid, keyed API for checking whether an email address
 * appears in known data breaches. We only query addresses the user has verified
 * they own. Breach data cannot be "removed" from attackers, so findings are
 * marked non-removable and the UI explains protective next steps instead.
 *
 * Enable by setting HIBP_API_KEY. The API is rate limited per key; we honour
 * 429 + Retry-After by reporting the source as rate limited for that scan.
 */
export class AdapterRateLimited extends Error {
  constructor(retryAfter) {
    super('Source rate limit reached');
    this.code = 'RATE_LIMITED';
    this.retryAfter = retryAfter;
  }
}

export const hibpAdapter = {
  key: 'hibp',
  name: 'Have I Been Pwned (data breaches)',
  description: 'Checks verified email addresses against publicly disclosed data breaches via the official HIBP API.',
  kind: 'breach',
  isDemo: false,
  dataTypes: ['email'],
  supportsVerification: false,
  defaultRemoval: {
    channel: 'none',
    instructions:
      'Breached data is held by third parties and cannot be deleted by a removal request. Change the password for this service and anywhere you reused it, enable two-factor authentication, and watch for phishing that references this breach.',
  },
  isAvailable: () => (env.HIBP_API_KEY ? { ok: true } : { ok: false, reason: 'Set HIBP_API_KEY to enable' }),

  async search({ identity, signal, fetchImpl = fetch }) {
    const results = [];
    for (const c of identity.contacts.filter((x) => x.type === 'email')) {
      const res = await fetchImpl(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(c.value)}?truncateResponse=false`, {
        headers: { 'hibp-api-key': env.HIBP_API_KEY, 'user-agent': env.SCAN_USER_AGENT },
        signal,
      });
      if (res.status === 404) continue; // not found in any breach
      if (res.status === 429) throw new AdapterRateLimited(Number(res.headers.get('retry-after')) || 6);
      if (!res.ok) throw new Error(`HIBP responded with HTTP ${res.status}`);
      const breaches = await res.json();
      for (const b of breaches) {
        const classes = (b.DataClasses || []).slice(0, 8).join(', ');
        results.push({
          sourceName: `Breach: ${b.Title}`,
          sourceUrl: `https://haveibeenpwned.com/PwnedWebsites#${encodeURIComponent(b.Name)}`,
          domain: b.Domain || 'haveibeenpwned.com',
          dataType: 'email',
          contactId: c.id,
          confidence: b.IsVerified ? 0.97 : 0.75,
          matchedValueMasked: c.masked,
          evidenceSummary: `${c.masked} was included in the ${b.Title} breach (${b.BreachDate}). Exposed data: ${classes || 'not specified'}.${b.IsVerified ? '' : ' HIBP lists this breach as unverified.'}`,
          category: 'breach',
          removable: false,
          externalId: b.Name,
        });
      }
    }
    return results;
  },
};
