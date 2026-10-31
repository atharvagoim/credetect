import { describe, expect, it } from 'vitest';
import { isBlockedIp, isPathAllowed, safeFetchText, validatePublicUrl } from '../server/utils/safeFetch.js';
import { htmlToText, matchIdentity } from '../server/adapters/matching.js';
import { urlCheckAdapter } from '../server/adapters/urlCheck.js';
import { hibpAdapter } from '../server/adapters/hibp.js';
import { env } from '../server/config/env.js';
import { normalizePhone, maskEmail } from '../server/utils/pii.js';
import { decrypt, encrypt } from '../server/utils/crypto.js';

const identity = {
  fullName: 'Asha Verma',
  contacts: [
    { id: 'c1', type: 'email', value: 'asha@example.com', masked: 'as••@example.com' },
    { id: 'c2', type: 'phone', value: '+919876543210', masked: '+91 ••••• •3210' },
  ],
};

describe('SSRF protection', () => {
  it('blocks private, loopback, link-local and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) expect(isBlockedIp(ip), ip).toBe(false);
  });

  it('rejects unsafe URLs before any request', () => {
    for (const u of ['file:///etc/passwd', 'http://localhost/', 'http://127.0.0.1/', 'http://user:pw@example.com/', 'http://example.com:8080/', 'gopher://x', 'http://169.254.169.254/latest/meta-data', 'http://metadata.internal/']) {
      expect(() => validatePublicUrl(u), u).toThrow();
    }
    expect(validatePublicUrl('https://example.com/a#frag').toString()).toBe('https://example.com/a');
  });

  it('refuses hostnames that resolve to private addresses at connect time', async () => {
    await expect(safeFetchText('http://localtest.me/')).rejects.toThrow(/not allowed|resolve|ENOTFOUND|EAI_AGAIN/);
  });
});

describe('robots.txt', () => {
  const robots = `User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: BadBot\nDisallow: /`;
  it('applies longest-match rules for the wildcard group', () => {
    expect(isPathAllowed(robots, '/public', 'PardaPrivacyBot')).toBe(true);
    expect(isPathAllowed(robots, '/private/x', 'PardaPrivacyBot')).toBe(false);
    expect(isPathAllowed(robots, '/private/ok/1', 'PardaPrivacyBot')).toBe(true);
    expect(isPathAllowed(`User-agent: PardaPrivacyBot\nDisallow: /`, '/x', 'PardaPrivacyBot')).toBe(false);
  });
});

describe('matching', () => {
  it('finds formatted phone numbers and obfuscated emails, with masked evidence', () => {
    const text = htmlToText('<p>Call Asha Verma on <b>+91-98765 43210</b> or asha [at] example [dot] com</p><script>var x="9999999999"</script>');
    const hits = matchIdentity(text, identity);
    expect(hits.map((h) => h.dataType).sort()).toEqual(['email', 'name', 'phone']);
    expect(JSON.stringify(hits)).not.toContain('9876543210');
    expect(hits.find((h) => h.dataType === 'name').confidence).toBeGreaterThan(0.8);
  });

  it('treats a lone name match as low confidence', () => {
    const hits = matchIdentity('Profile of Asha Verma, Pune', identity);
    expect(hits).toHaveLength(1);
    expect(hits[0].confidence).toBeLessThan(0.5);
  });

  it('does not match partial numbers', () => {
    expect(matchIdentity('Order 98765 4321 shipped', identity)).toHaveLength(0);
  });
});

describe('page-check adapter', () => {
  it('respects robots.txt and reports fetch errors without throwing', async () => {
    const res = await urlCheckAdapter.search({
      identity,
      urls: ['https://site-a.example/p', 'https://site-b.example/q'],
      robots: async (u) => !u.includes('site-b'),
      fetchText: async (u) => ({ url: u, status: 200, body: '<html>Contact: 98765-43210</html>' }),
    });
    expect(res).toHaveLength(1);
    expect(res[0].dataType).toBe('phone');
    expect(res.errors[0].message).toContain('robots.txt');
  });

  it('verifies removal when the page no longer contains the identifier', async () => {
    const finding = { sourceUrl: 'https://site-a.example/p', dataType: 'phone' };
    expect(await urlCheckAdapter.verifyRemoval({ finding, identity, fetchText: async () => ({ status: 200, body: 'nothing here' }) })).toBe('absent');
    expect(await urlCheckAdapter.verifyRemoval({ finding, identity, fetchText: async () => ({ status: 200, body: '9876543210' }) })).toBe('present');
    expect(await urlCheckAdapter.verifyRemoval({ finding, identity, fetchText: async () => ({ status: 404, body: '' }) })).toBe('absent');
  });
});

describe('HIBP adapter', () => {
  it('is unavailable without an API key', () => {
    expect(hibpAdapter.isAvailable().ok).toBe(false);
  });

  it('maps breaches to non-removable findings and handles 404 and 429', async () => {
    env.HIBP_API_KEY = 'k';
    try {
      const breaches = [{ Name: 'Acme', Title: 'Acme', Domain: 'acme.example', BreachDate: '2024-01-01', DataClasses: ['Email addresses', 'Passwords'], IsVerified: true }];
      const found = await hibpAdapter.search({ identity, fetchImpl: async () => ({ status: 200, ok: true, json: async () => breaches }) });
      expect(found).toHaveLength(1);
      expect(found[0].removable).toBe(false);
      expect(found[0].category).toBe('breach');
      expect(found[0].evidenceSummary).not.toContain('asha@example.com');
      expect(await hibpAdapter.search({ identity, fetchImpl: async () => ({ status: 404, ok: false }) })).toHaveLength(0);
      await expect(hibpAdapter.search({ identity, fetchImpl: async () => ({ status: 429, ok: false, headers: new Headers({ 'retry-after': '3' }) }) })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    } finally {
      env.HIBP_API_KEY = '';
    }
  });
});

describe('utilities', () => {
  it('normalises Indian phone formats', () => {
    for (const v of ['9876543210', '09876543210', '919876543210', '+91 98765-43210']) expect(normalizePhone(v)).toBe('+919876543210');
    expect(normalizePhone('+91 12345 67890')).toBeNull();
    expect(normalizePhone('+14155550123')).toBe('+14155550123');
  });
  it('masks and encrypts', () => {
    expect(maskEmail('asha@example.com')).toBe('as••@example.com');
    const c = encrypt('secret');
    expect(c).not.toContain('secret');
    expect(decrypt(c)).toBe('secret');
    const tampered = c.slice(0, -2) + (c.endsWith('A') ? 'B' : 'A') + c.slice(-1);
    expect(() => decrypt(tampered)).toThrow();
  });
});
