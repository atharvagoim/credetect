import { htmlToText, matchIdentity } from './matching.js';
import { FetchBlockedError, robotsAllows, safeFetchText, validatePublicUrl } from '../utils/safeFetch.js';

/**
 * REAL ADAPTER: Page check.
 * The user supplies specific public URLs where they believe their details appear.
 * We fetch only those pages (SSRF-guarded, robots.txt respected, no login, no CAPTCHA
 * bypass), look for the user's verified identifiers, and record masked evidence.
 * It does not crawl or follow links.
 */
export const urlCheckAdapter = {
  key: 'url_check',
  name: 'Page check (URLs you provide)',
  description: 'Fetches specific public pages you provide and checks them for your verified details. Respects robots.txt; never logs in or bypasses access controls.',
  kind: 'page',
  isDemo: false,
  dataTypes: ['email', 'phone', 'name'],
  supportsVerification: true,
  requiresUrls: true,
  defaultRemoval: {
    channel: 'email',
    instructions:
      "Find the website's grievance officer or privacy contact (usually linked in the footer, privacy policy, or terms). Indian intermediaries must publish a grievance officer under the IT Rules, 2021. If the site only offers a web form, use it and record the reference ID here.",
  },
  isAvailable: () => ({ ok: true }),

  async search({ identity, urls = [], fetchText = safeFetchText, robots = robotsAllows }) {
    const results = [];
    const errors = [];
    for (const raw of urls) {
      try {
        validatePublicUrl(raw);
        if (!(await robots(raw))) {
          errors.push({ url: raw, message: 'robots.txt disallows automated access to this page' });
          continue;
        }
        const page = await fetchText(raw);
        if (page.status >= 400) {
          errors.push({ url: raw, message: `Page returned HTTP ${page.status}` });
          continue;
        }
        const text = page.body.includes('<') ? htmlToText(page.body) : page.body;
        for (const m of matchIdentity(text, identity)) {
          results.push({
            sourceName: new URL(page.url).hostname,
            sourceUrl: page.url,
            dataType: m.dataType,
            contactId: m.contactId,
            confidence: m.confidence,
            matchedValueMasked: m.matchedValueMasked,
            evidenceSummary: `${m.evidence} Checked ${new Date().toISOString().slice(0, 10)}.`,
            category: 'page',
            removable: true,
          });
        }
      } catch (err) {
        errors.push({ url: raw, message: err instanceof FetchBlockedError ? err.message : err.code === 'TIMEOUT' ? 'Timed out' : 'Could not fetch page' });
      }
    }
    return Object.assign(results, { errors });
  },

  async verifyRemoval({ finding, identity, fetchText = safeFetchText }) {
    try {
      const page = await fetchText(finding.sourceUrl);
      if (page.status === 404 || page.status === 410) return 'absent';
      if (page.status >= 400) return 'unknown';
      const text = page.body.includes('<') ? htmlToText(page.body) : page.body;
      const still = matchIdentity(text, identity).some((m) => m.dataType === finding.dataType);
      return still ? 'present' : 'absent';
    } catch {
      return 'unknown';
    }
  },
};
