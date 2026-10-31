import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { env } from '../config/env.js';

/**
 * SSRF-hardened fetch for user-influenced URLs.
 * - http/https only, default ports only, no embedded credentials
 * - every resolved address checked against private/reserved ranges AT CONNECT TIME
 *   (custom lookup, so DNS rebinding between check and connect is not possible)
 * - redirects followed manually (max 3), each hop re-validated
 * - strict timeout and response-size cap, text/html or text/plain only
 */

export class FetchBlockedError extends Error {
  constructor(message, code = 'URL_BLOCKED') {
    super(message);
    this.code = code;
  }
}

const v4Blocked = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const ip4ToInt = (ip) => ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;

export function isBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const n = ip4ToInt(ip);
    return v4Blocked.some(([base, bits]) => {
      const m = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & m) === (ip4ToInt(base) & m);
    });
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return (
      lower === '::' || lower === '::1' || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb') ||
      lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('ff') || lower.startsWith('64:ff9b') || lower.startsWith('2001:db8') || lower.startsWith('::ffff:')
    );
  }
  return true;
}

function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length) return callback(new FetchBlockedError('Host did not resolve'));
    const bad = addresses.find((a) => isBlockedIp(a.address));
    if (bad) return callback(new FetchBlockedError('Destination address is not allowed'));
    if (options?.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

export function validatePublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError('Not a valid URL', 'URL_INVALID');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new FetchBlockedError('Only http and https URLs are allowed');
  if (url.username || url.password) throw new FetchBlockedError('URLs with credentials are not allowed');
  if (url.port && !['80', '443'].includes(url.port)) throw new FetchBlockedError('Non-standard ports are not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isBlockedIp(host)) throw new FetchBlockedError('Destination address is not allowed');
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new FetchBlockedError('Destination host is not allowed');
  url.hash = '';
  return url;
}

function requestOnce(url, { timeoutMs, maxBytes, accept }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup,
        headers: { 'User-Agent': env.SCAN_USER_AGENT, Accept: accept, 'Accept-Encoding': 'identity' },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, redirect: new URL(res.headers.location, url).toString() });
        }
        const type = String(res.headers['content-type'] || '').toLowerCase();
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy();
            resolve({ status, contentType: type, body: Buffer.concat(chunks).toString('utf8'), truncated: true });
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, contentType: type, body: Buffer.concat(chunks).toString('utf8'), truncated: false }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' })));
    req.on('error', reject);
    req.end();
  });
}

export async function safeFetchText(rawUrl, { timeoutMs = 8000, maxBytes = 1_500_000, maxRedirects = 3, accept = 'text/html,text/plain;q=0.9' } = {}) {
  let url = validatePublicUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await requestOnce(url, { timeoutMs, maxBytes, accept });
    if (res.redirect) {
      url = validatePublicUrl(res.redirect);
      continue;
    }
    if (res.contentType && !/^(text\/html|text\/plain|application\/xhtml\+xml)/.test(res.contentType)) {
      throw new FetchBlockedError(`Unsupported content type`, 'UNSUPPORTED_CONTENT');
    }
    return { url: url.toString(), status: res.status, body: res.body, truncated: res.truncated };
  }
  throw new FetchBlockedError('Too many redirects', 'TOO_MANY_REDIRECTS');
}

/** Minimal robots.txt check for our user agent and `*`. Unreachable robots.txt = allowed (RFC 9309). */
export async function robotsAllows(rawUrl) {
  const url = validatePublicUrl(rawUrl);
  let txt = '';
  try {
    const res = await safeFetchText(`${url.origin}/robots.txt`, { timeoutMs: 4000, maxBytes: 200_000, accept: 'text/plain' });
    if (res.status >= 400) return true;
    txt = res.body;
  } catch (err) {
    if (err instanceof FetchBlockedError && err.code !== 'UNSUPPORTED_CONTENT') throw err;
    return true;
  }
  return isPathAllowed(txt, url.pathname + url.search, 'PardaPrivacyBot');
}

export function isPathAllowed(robotsTxt, path, agent) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const line of robotsTxt.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, '').trim();
    const m = clean.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (current && (field === 'allow' || field === 'disallow')) {
      current.rules.push({ allow: field === 'allow', path: value });
      lastWasAgent = false;
    }
  }
  const ua = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = applicable.flatMap((g) => g.rules).filter((r) => r.path);
  const toRegex = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  let best = null;
  for (const r of rules) {
    if (toRegex(r.path).test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best ? best.allow : true;
}
