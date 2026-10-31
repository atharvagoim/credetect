import crypto from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

/** Validate req[part] with a zod schema and replace it with the parsed value. */
export const validate = (schema, part = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[part] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return next(new AppError(400, 'VALIDATION_ERROR', details[0]?.message || 'Invalid input', details));
  }
  if (part === 'query') req.validQuery = result.data;
  else req[part] = result.data;
  next();
};

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Strip keys that start with `$` or contain `.` from JSON bodies. */
export function sanitizeBody(req, _res, next) {
  const clean = (v, depth = 0) => {
    if (depth > 10) return undefined;
    if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1));
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        out[k] = clean(val, depth + 1);
      }
      return out;
    }
    return v;
  };
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  next();
}

/** Logs method, path (no query string), status, duration. Never bodies, cookies or headers. */
export function requestLogger(req, res, next) {
  req.id = crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (env.isTest) return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const path = req.originalUrl.split('?')[0].replace(/[a-f\d]{24}/gi, ':id');
    console.log(JSON.stringify({ t: new Date().toISOString(), id: req.id, m: req.method, p: path, s: res.statusCode, ms: Math.round(ms) }));
  });
  next();
}

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Endpoint not found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message;
  if (err.type === 'entity.too.large') [status, code, message] = [413, 'PAYLOAD_TOO_LARGE', 'Request body too large'];
  else if (err.type === 'entity.parse.failed') [status, code, message] = [400, 'BAD_JSON', 'Malformed JSON body'];
  else if (err.name === 'CastError') [status, code, message] = [400, 'BAD_REQUEST', 'Invalid identifier'];
  else if (err.code === 11000) [status, code, message] = [409, 'CONFLICT', 'This already exists'];
  if (typeof code !== 'string') code = 'INTERNAL_ERROR';
  if (status >= 500) {
    if (!env.isTest) console.error(JSON.stringify({ id: req.id, error: err.name, message: String(err.message).slice(0, 300) }));
    if (code === 'INTERNAL_ERROR') message = 'Something went wrong on our side. Please try again.';
  }
  res.status(status).json({ error: { code, message, ...(err.details ? { details: err.details } : {}) }, requestId: req.id });
}
