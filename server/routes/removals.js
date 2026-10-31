import { Router } from 'express';
import { z } from 'zod';
import { validate, objectId, pagination } from '../middleware/common.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { REMOVAL_REQUEST_STATUSES, RemovalRequest } from '../models/index.js';
import { ah, notFound, AppError } from '../utils/errors.js';
import {
  addEvidence,
  approveRemoval,
  cancelRemoval,
  createRemoval,
  recordManualSubmission,
  recordOutcome,
  submitRemoval,
  verifyRemoval,
} from '../services/removals.js';
import { serializeRemoval } from '../services/serializers.js';
import { requireConsent } from '../services/consent.js';

const router = Router();
const idParam = validate(z.object({ id: objectId }), 'params');
const detail = (r) => ({ removal: serializeRemoval(r, { includeBody: true }) });

router.post(
  '/removal-requests',
  rateLimit({ name: 'removal-create', windowMs: 24 * 3600_000, max: 30, by: 'user' }),
  validate(
    z.object({
      findingId: objectId,
      recipientEmail: z.string().trim().email('Enter a valid email address').max(254).optional().or(z.literal('')),
      formUrl: z.string().trim().url('Enter a full URL').max(2000).optional().or(z.literal('')),
    }),
  ),
  ah(async (req, res) => {
    await requireConsent(req.user._id, ['data_processing']);
    res.status(201).json(detail(await createRemoval(req.user, req.body)));
  }),
);

router.get(
  '/removal-requests',
  validate(pagination.extend({ status: z.enum(REMOVAL_REQUEST_STATUSES).optional() }), 'query'),
  ah(async (req, res) => {
    const { page, limit, status } = req.validQuery;
    const filter = { user: req.user._id, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      RemovalRequest.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
      RemovalRequest.countDocuments(filter),
    ]);
    res.json({ items: items.map((r) => serializeRemoval(r)), page, limit, total });
  }),
);

router.get(
  '/removal-requests/:id',
  idParam,
  ah(async (req, res) => {
    const r = await RemovalRequest.findOne({ _id: req.params.id, user: req.user._id });
    if (!r) throw notFound('Removal request not found');
    res.json(detail(r));
  }),
);

router.post(
  '/removal-requests/:id/approve',
  idParam,
  validate(
    z.object({
      confirm: z.literal(true, { message: 'Confirm that you authorise this request' }),
      subject: z.string().trim().min(5).max(300).optional(),
      body: z.string().trim().min(50, 'The request is too short').max(6000).optional(),
    }),
  ),
  ah(async (req, res) => res.json(detail(await approveRemoval(req.user, req.params.id, req.body)))),
);

router.post(
  '/removal-requests/:id/submit',
  rateLimit({ name: 'removal-submit', windowMs: 24 * 3600_000, max: 20, by: 'user' }),
  idParam,
  ah(async (req, res) => res.json(detail(await submitRemoval(req.user, req.params.id)))),
);

router.post(
  '/removal-requests/:id/mark-submitted',
  idParam,
  validate(z.object({ referenceId: z.string().trim().max(200).optional(), note: z.string().trim().max(500).optional() })),
  ah(async (req, res) => res.json(detail(await recordManualSubmission(req.user, req.params.id, req.body)))),
);

router.post(
  '/removal-requests/:id/evidence',
  idParam,
  validate(
    z
      .object({
        kind: z.enum(['note', 'link', 'response']),
        text: z.string().trim().max(4000).optional(),
        url: z.string().trim().url().max(2000).refine((u) => /^https?:/i.test(u), 'Only http(s) links').optional(),
      })
      .refine((v) => v.text || v.url, 'Add text or a link'),
  ),
  ah(async (req, res) => res.json(detail(await addEvidence(req.user, req.params.id, req.body)))),
);

router.post(
  '/removal-requests/:id/outcome',
  idParam,
  validate(z.object({ outcome: z.enum(['removed', 'rejected', 'unable_to_remove']), note: z.string().trim().max(500).optional() })),
  ah(async (req, res) => res.json(detail(await recordOutcome(req.user, req.params.id, req.body)))),
);

router.post(
  '/removal-requests/:id/recheck',
  rateLimit({ name: 'removal-recheck', windowMs: 3600_000, max: 10, by: 'user' }),
  idParam,
  ah(async (req, res) => {
    const r = await RemovalRequest.findOne({ _id: req.params.id, user: req.user._id });
    if (!r) throw notFound('Removal request not found');
    if (!['submitted', 'awaiting_response'].includes(r.status)) throw new AppError(409, 'INVALID_STATE', 'Only submitted requests can be re-checked.');
    const { result, removal } = await verifyRemoval(r, 'user');
    res.json({ result, ...detail(removal) });
  }),
);

router.post(
  '/removal-requests/:id/cancel',
  idParam,
  ah(async (req, res) => res.json(detail(await cancelRemoval(req.user, req.params.id)))),
);

export default router;
