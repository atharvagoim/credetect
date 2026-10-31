import { RateLimitBucket } from '../models/index.js';
import { hmac } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { recordEvent } from '../services/events.js';

export const clientIp = (req) => String(req.get('x-real-ip') || req.get('x-forwarded-for')?.split(',')[0] || req.ip || 'unknown').trim();

/** Increment a shared fixed-window counter. Returns the new count. */
export async function hit(key, windowMs) {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const bucketKey = `${key}:${windowStart}`;
  const doc = await RateLimitBucket.findOneAndUpdate(
    { key: bucketKey },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs) } },
    { upsert: true, returnDocument: 'after' },
  );
  return { count: doc.count, resetAt: windowStart + windowMs };
}

/**
 * Mongo-backed limiter so limits hold across serverless instances.
 * by: 'ip' | 'user' | (req) => string
 */
export function rateLimit({ name, windowMs, max, by = 'ip' }) {
  return async (req, res, next) => {
    try {
      const subject = typeof by === 'function' ? by(req) : by === 'user' ? String(req.user?._id || clientIp(req)) : clientIp(req);
      const { count, resetAt } = await hit(`${name}:${hmac(subject).slice(0, 32)}`, windowMs);
      res.set('RateLimit-Limit', String(max));
      res.set('RateLimit-Remaining', String(Math.max(0, max - count)));
      if (count > max) {
        res.set('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
        if (count === max + 1) {
          await recordEvent({ level: 'warn', kind: 'rate_limit', source: name, message: `Rate limit exceeded on ${name}`, meta: { subjectRef: hmac(subject).slice(0, 12), path: req.baseUrl + req.route?.path } });
        }
        if (count === max * 5) {
          await recordEvent({ level: 'error', kind: 'abuse', source: name, message: `Sustained abuse pattern on ${name}`, meta: { subjectRef: hmac(subject).slice(0, 12) } });
        }
        return next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait and try again.'));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
