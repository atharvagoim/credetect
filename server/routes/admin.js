import { Router } from 'express';
import { z } from 'zod';
import { validate, objectId, pagination } from '../middleware/common.js';
import { ExposureFinding, JOB_STATUSES, RemovalRequest, ScanJob, SourceAdapter, SystemEvent, User } from '../models/index.js';
import { hmac } from '../utils/crypto.js';
import { ah, notFound } from '../utils/errors.js';
import { listSources } from '../services/scanner.js';
import { audit } from '../services/events.js';
import { validatePublicUrl } from '../utils/safeFetch.js';

/**
 * Admin console API. Responses contain aggregate counts, ids and pseudonymous
 * user references only. No names, emails, phone numbers or request bodies.
 */
const router = Router();
const userRef = (id) => (id ? hmac('user:' + id).slice(0, 10) : null);

router.get(
  '/overview',
  ah(async (_req, res) => {
    const since = new Date(Date.now() - 7 * 864e5);
    const [users, verifiedUsers, jobs, findings, removals, openAlerts, monitoringOn] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ emailVerifiedAt: { $ne: null } }),
      ScanJob.aggregate([{ $match: { createdAt: { $gt: since } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      ExposureFinding.aggregate([{ $group: { _id: '$isDemo', n: { $sum: 1 } } }]),
      RemovalRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      SystemEvent.countDocuments({ acknowledgedAt: null, level: { $in: ['warn', 'error'] } }),
      User.countDocuments({ 'monitoring.enabled': true }),
    ]);
    const toObj = (arr) => Object.fromEntries(arr.map((x) => [String(x._id), x.n]));
    const f = toObj(findings);
    res.json({ users, verifiedUsers, monitoringOn, jobs7d: toObj(jobs), findings: { real: f.false || 0, demo: f.true || 0 }, removals: toObj(removals), openAlerts });
  }),
);

router.get(
  '/sources',
  ah(async (_req, res) => res.json({ sources: await listSources() })),
);

router.patch(
  '/sources/:key',
  validate(z.object({ key: z.string().regex(/^[a-z_]{2,40}$/) }), 'params'),
  validate(
    z
      .object({
        enabled: z.boolean().optional(),
        rateLimitPerMinute: z.number().int().min(1).max(600).optional(),
        timeoutMs: z.number().int().min(1000).max(30000).optional(),
        removal: z
          .object({
            contactEmail: z.string().trim().email().or(z.literal('')).optional(),
            formUrl: z.string().trim().url().or(z.literal('')).optional(),
            instructions: z.string().max(2000).optional(),
            subjectTemplate: z.string().max(300).optional(),
            bodyTemplate: z.string().max(6000).optional(),
          })
          .optional(),
      })
      .strict(),
  ),
  ah(async (req, res) => {
    const set = {};
    for (const k of ['enabled', 'rateLimitPerMinute', 'timeoutMs']) if (req.body[k] !== undefined) set[k] = req.body[k];
    if (req.body.removal) {
      if (req.body.removal.formUrl) validatePublicUrl(req.body.removal.formUrl);
      for (const [k, v] of Object.entries(req.body.removal)) set[`removal.${k}`] = v;
    }
    const doc = await SourceAdapter.findOneAndUpdate({ key: req.params.key }, { $set: set }, { returnDocument: 'after' });
    if (!doc) throw notFound('Source not found');
    await audit(req.user._id, 'admin.source_updated', { actor: 'admin', targetType: 'SourceAdapter', targetId: doc.key, meta: { fields: Object.keys(set) } });
    res.json({ source: doc });
  }),
);

router.get(
  '/jobs',
  validate(pagination.extend({ status: z.enum(JOB_STATUSES).optional() }), 'query'),
  ah(async (req, res) => {
    const { page, limit, status } = req.validQuery;
    const filter = status ? { status } : {};
    const [items, total] = await Promise.all([
      ScanJob.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ScanJob.countDocuments(filter),
    ]);
    res.json({
      items: items.map((j) => ({
        id: String(j._id),
        userRef: userRef(j.user),
        status: j.status,
        trigger: j.trigger,
        attempts: j.attempts,
        sources: j.sources.map(({ key, status: s, findings, durationMs, message }) => ({ key, status: s, findings, durationMs, message })),
        createdAt: j.createdAt,
        finishedAt: j.finishedAt,
        error: j.error,
      })),
      page,
      limit,
      total,
    });
  }),
);

router.get(
  '/events',
  validate(pagination.extend({ kind: z.enum(['adapter_error', 'job_failed', 'rate_limit', 'abuse', 'email_error', 'billing', 'config']).optional(), open: z.enum(['true', 'false']).optional() }), 'query'),
  ah(async (req, res) => {
    const { page, limit, kind, open } = req.validQuery;
    const filter = { ...(kind ? { kind } : {}), ...(open === 'true' ? { acknowledgedAt: null } : {}) };
    const [items, total] = await Promise.all([
      SystemEvent.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SystemEvent.countDocuments(filter),
    ]);
    res.json({ items: items.map((e) => ({ id: String(e._id), level: e.level, kind: e.kind, source: e.source, message: e.message, meta: e.meta, createdAt: e.createdAt, acknowledgedAt: e.acknowledgedAt })), page, limit, total });
  }),
);

router.post(
  '/events/:id/ack',
  validate(z.object({ id: objectId }), 'params'),
  ah(async (req, res) => {
    const e = await SystemEvent.findByIdAndUpdate(req.params.id, { $set: { acknowledgedAt: new Date() } }, { returnDocument: 'after' });
    if (!e) throw notFound();
    res.json({ ok: true });
  }),
);

export default router;
