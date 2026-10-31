import { env } from '../config/env.js';
import { hmac } from '../utils/crypto.js';

/**
 * DEMO ADAPTER. Produces deterministic, clearly-labelled sample findings on
 * reserved `.example` domains so the full workflow can be exercised without
 * touching any real website. Every result carries isDemo: true and the UI
 * badges it as demo data. Never use as evidence of real exposure.
 */
const DIRECTORIES = [
  { name: 'Sample People Directory (demo)', host: 'people-directory.example', path: 'profile' },
  { name: 'Sample Business Listings (demo)', host: 'business-listings.example', path: 'listing' },
  { name: 'Sample Caller ID Lookup (demo)', host: 'callerid-lookup.example', path: 'number' },
  { name: 'Sample Resume Board (demo)', host: 'resume-board.example', path: 'candidate' },
];

export const demoAdapter = {
  key: 'demo',
  name: 'Demo source (sample data)',
  description: 'Generates labelled sample findings on reserved .example domains for development and testing. No real website is contacted.',
  kind: 'listing',
  isDemo: true,
  dataTypes: ['email', 'phone', 'name'],
  supportsVerification: true,
  defaultRemoval: {
    channel: 'demo',
    instructions: 'Demo source: submission is simulated and nothing is sent. Use it to try the removal workflow.',
  },
  isAvailable: () => ({ ok: true }),

  async search({ identity }) {
    const results = [];
    for (const c of identity.contacts) {
      const seed = parseInt(hmac(`demo:${c.type}:${c.value}`).slice(0, 8), 16);
      const count = 1 + (seed % 2);
      for (let i = 0; i < count; i++) {
        const dir = DIRECTORIES[(seed + i * 3 + (c.type === 'phone' ? 1 : 0)) % DIRECTORIES.length];
        const slug = hmac(`demo-slug:${c.value}:${i}`).slice(0, 10);
        results.push({
          sourceName: dir.name,
          sourceUrl: `https://${dir.host}/${dir.path}/${slug}`,
          dataType: c.type,
          contactId: c.id,
          confidence: 0.7 + ((seed >> (i + 2)) % 25) / 100,
          matchedValueMasked: c.masked,
          evidenceSummary: `DEMO DATA. A sample ${dir.path} page lists ${c.masked}. This result is generated for testing and does not reflect a real website.`,
          category: 'listing',
          removable: true,
        });
      }
    }
    if (identity.fullName && identity.contacts.length) {
      results.push({
        sourceName: DIRECTORIES[0].name,
        sourceUrl: `https://${DIRECTORIES[0].host}/profile/${hmac('demo-name:' + identity.fullName).slice(0, 10)}`,
        dataType: 'name',
        contactId: null,
        confidence: 0.55,
        matchedValueMasked: identity.fullName.split(/\s+/).map((p) => p[0] + '•••').join(' '),
        evidenceSummary: 'DEMO DATA. A sample profile shows a matching full name. Generated for testing.',
        category: 'listing',
        removable: true,
      });
    }
    return results;
  },

  /** Demo listings are reported as gone once a (simulated) request has been submitted. */
  async verifyRemoval({ removal }) {
    return removal?.submittedAt ? 'absent' : 'present';
  },
};
