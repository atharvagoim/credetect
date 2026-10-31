import { Router } from 'express';
import { z } from 'zod';
import { validate, objectId, pagination } from '../middleware/common.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { ExposureFinding, FINDING_STATUSES, REMOVAL_STATUSES, ScanJob } from '../models/index.js';
import { ah, notFound } from '../utils/errors.js';
import { claimJob, createScanJob, listSources, runJob } from '../services/scanner.js';
import { audit } from '../services/events.js';
import { serializeFinding, serializeJob } from '../services/serializers.js';

const router = Router();

router.get(
  '/sources',
  ah(async (_req, res) => {
    const sources = await listSources();
    res.json({ sources: sources.map(({ config, ...s }) => s) });
  }),
);

router.post(
  '/scans',
  rateLimit({ name: 'scan-create', windowMs: 3600_000, max: 12, by: 'user' }),
  validate(
    z.object({
      sources: z.array(z.string().regex(/^[a-z_]{2,40}$/)).max(10).optional(),
      urls: z.array(z.string().trim().url('Enter full URLs starting with https://').max(2000)).max(3, 'Check up to 3 pages at a time').optional(),
    }),
  ),
  ah(async (req, res) => {
    const job = await createScanJob(req.user, { sources: req.body.sources, urls: req.body.urls || [] });
    // Run inline within this request (serverless-friendly). Anything that fails
    // transiently is re-queued and picked up by the cron worker.
    const claimed = await claimJob({ _id: job._id });
    const done = claimed ? await runJob(claimed) : job;
    res.status(201).json({ job: serializeJob(done) });
  }),
);

router.get(
  '/scans',
  validate(pagination, 'query'),
  ah(async (req, res) => {
    const { page, limit } = req.validQuery;
    const [items, total] = await Promise.all([
      ScanJob.find({ user: req.user._id }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ScanJob.countDocuments({ user: req.user._id }),
    ]);
    res.json({ items: items.map(serializeJob), page, limit, total });
  }),
);

router.get(
  '/scans/:id',
  validate(z.object({ id: objectId }), 'params'),
  ah(async (req, res) => {
    const job = await ScanJob.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) throw notFound('Scan not found');
    res.json({ job: serializeJob(job) });
  }),
);

const findingQuery = pagination.extend({
  status: z.enum(FINDING_STATUSES).optional(),
  removalStatus: z.enum(REMOVAL_STATUSES).optional(),
  dataType: z.enum(['email', 'phone', 'name']).optional(),
  sourceKey: z.string().regex(/^[a-z_]{2,40}$/).optional(),
  demo: z.enum(['true', 'false']).optional(),
  scan: objectId.optional(),
});

router.get(
  '/findings',
  validate(findingQuery, 'query'),
  ah(async (req, res) => {
    const { page, limit, status, removalStatus, dataType, sourceKey, demo, scan } = req.validQuery;
    const filter = { user: req.user._id };
    if (status) filter.status = status;
    else filter.status = { $ne: 'dismissed' };
    if (removalStatus) filter.removalStatus = removalStatus;
    if (dataType) filter.dataType = dataType;
    if (sourceKey) filter.sourceKey = sourceKey;
    if (demo) filter.isDemo = demo === 'true';
    if (scan) filter.scanJob = scan;
    const [items, total, sources] = await Promise.all([
      ExposureFinding.find(filter).sort({ firstSeenAt: -1 }).skip((page - 1) * limit).limit(limit),
      ExposureFinding.countDocuments(filter),
      ExposureFinding.distinct('sourceKey', { user: req.user._id }),
    ]);
    res.json({ items: items.map(serializeFinding), page, limit, total, facets: { sources } });
  }),
);

router.get(
  '/findings/:id',
  validate(z.object({ id: objectId }), 'params'),
  ah(async (req, res) => {
    const f = await ExposureFinding.findOne({ _id: req.params.id, user: req.user._id });
    if (!f) throw notFound('Finding not found');
    res.json({ finding: serializeFinding(f) });
  }),
);

router.patch(
  '/findings/:id',
  validate(z.object({ id: objectId }), 'params'),
  validate(z.object({ status: z.enum(['reviewed', 'confirmed', 'dismissed']) })),
  ah(async (req, res) => {
    const f = await ExposureFinding.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { $set: { status: req.body.status } }, { returnDocument: 'after' });
    if (!f) throw notFound('Finding not found');
    await audit(req.user._id, 'finding.status_changed', { targetType: 'ExposureFinding', targetId: f._id, meta: { status: req.body.status } });
    res.json({ finding: serializeFinding(f) });
  }),
);

export default router;
