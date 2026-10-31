# Adding a source adapter

An adapter is a plain object registered in `server/adapters/index.js`. Code defines what it can do; the `SourceAdapter` collection holds admin-editable config (enabled, rate limit, timeout, removal email/form, templates), created automatically on first run.

```js
export const exampleAdapter = {
  key: 'example_dir',                // unique, [a-z_]
  name: 'Example Directory',
  description: 'What it checks and how.',
  kind: 'listing',                   // 'listing' | 'breach' | 'page'
  isDemo: false,
  dataTypes: ['phone', 'name'],
  supportsVerification: true,        // can re-check after a removal request
  requiresUrls: false,               // true only for user-supplied URL checks
  defaultRemoval: {
    channel: 'email',                // 'email' | 'web_form' | 'none'
    instructions: 'Shown to users next to the request.',
  },
  isAvailable: () => (process.env.EXAMPLE_API_KEY ? { ok: true } : { ok: false, reason: 'Set EXAMPLE_API_KEY' }),

  // identity = { fullName, contacts: [{ id, type, value, masked }] }  (verified only)
  async search({ identity, signal }) {
    return [{
      sourceName: 'Example Directory',
      sourceUrl: 'https://example.com/listing/123',
      dataType: 'phone',
      contactId: identity.contacts[0].id,  // null for name-only matches
      confidence: 0.9,                     // 0..1
      matchedValueMasked: identity.contacts[0].masked,
      evidenceSummary: 'Masked description of what was seen. Never raw values.',
      category: 'listing',
      removable: true,
    }];
  },

  // 'absent' | 'present' | 'unknown'
  async verifyRemoval({ finding, removal, identity }) { return 'unknown'; },
};
```

The scanner handles the rest: per-source rate limiting, timeouts (`AbortSignal` passed as `signal`), retries with backoff for timeouts/429s (throw an error with `code: 'RATE_LIMITED'` or `'TIMEOUT'`), deduplication (by user + source + URL + data type + contact), stats, admin error events, and notifications.

## Rules for any new source
- Only add a source whose terms permit the lookup, ideally via an official API. Read its robots.txt and ToS.
- Never log in, bypass CAPTCHAs, rotate IPs, or evade rate limits.
- Fetch user-influenced URLs only through `server/utils/safeFetch.js`.
- Only return matches for the user's **verified** identifiers. Mask values in `evidenceSummary`; never store page copies.
- Set `isDemo: true` for anything synthetic.
- Add tests with a mocked `fetch` in `tests/adapters.test.js`.
