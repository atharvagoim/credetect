import { Router } from 'express';
import { z } from 'zod';
import { validate, objectId, pagination } from '../middleware/common.js';
import { AuditLog, ExposureFinding, Notification, RemovalRequest, ScanJob, User } from '../models/index.js';
import { verifyPayload } from '../utils/crypto.js';
import { ah, AppError, notFound } from '../utils/errors.js';
import { requireConsent } from '../services/consent.js';
import { audit } from '../services/events.js';
import { serializeJob } from '../services/serializers.js';

/** Public routes (no session): signed unsubscribe link. */
export const publicAccountRouter = Router();

publicAccountRouter.get(
  '/notifications/unsubscribe',
  ah(async (req, res) => {
    const data = verifyPayload(String(req.query.token || ''));
    if (!data || data.p !== 'unsub') return res.redirect(302, '/unsubscribed?status=invalid');
    await User.updateOne({ _id: data.u }, { $set: { 'notificationPrefs.email': false } });
    await audit(data.u, 'notifications.unsubscribed', { actor: 'user' }).catch(() => {});
    res.redirect(302, '/unsubscribed?status=ok');
  }),
);

const router = Router();

export const FREQUENCY_DAYS = { weekly: 7, monthly: 30 };

router.get('/monitoring', (req, res) => res.json({ monitoring: req.user.monitoring, plan: req.user.plan?.tier || 'free' }));

router.patch(
  '/monitoring',
  validate(z.object({ enabled: z.boolean(), frequency: z.enum(['weekly', 'monthly']).optional() })),
  ah(async (req, res) => {
    const u = req.user;
    const frequency = req.body.frequency || u.monitoring.frequency || 'monthly';
    if (req.body.enabled) {
      await requireConsent(u._id, ['data_processing', 'scanning', 'monitoring']);
      if (frequency === 'weekly' && u.plan?.tier !== 'monitor' && u.role !== 'admin') {
        throw new AppError(402, 'PLAN_LIMIT', 'Weekly monitoring is part of the Monitor plan. Monthly monitoring is free.');
      }
    }
    u.monitoring.enabled = req.body.enabled;
    u.monitoring.frequency = frequency;
    u.monitoring.nextRunAt = req.body.enabled ? new Date(Date.now() + FREQUENCY_DAYS[frequency] * 864e5) : null;
    await u.save();
    await audit(u._id, req.body.enabled ? 'monitoring.enabled' : 'monitoring.disabled', { meta: { frequency } });
    res.json({ monitoring: u.monitoring });
  }),
);

router.get(
  '/notifications',
  validate(pagination.extend({ unread: z.enum(['true', 'false']).optional() }), 'query'),
  ah(async (req, res) => {
    const { page, limit, unread } = req.validQuery;
    const filter = { user: req.user._id, ...(unread === 'true' ? { readAt: null } : {}) };
    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: req.user._id, readAt: null }),
    ]);
    res.json({
      items: items.map((n) => ({ id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt, createdAt: n.createdAt })),
      page,
      limit,
      total,
      unreadCount,
    });
  }),
);

router.post(
  '/notifications/read-all',
  ah(async (req, res) => {
    await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
  }),
);

router.post(
  '/notifications/:id/read',
  validate(z.object({ id: objectId }), 'params'),
  ah(async (req, res) => {
    const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { $set: { readAt: new Date() } });
    if (!n) throw notFound();
    res.json({ ok: true });
  }),
);

const ACTIVITY_LABELS = {
  'scan.created': 'Scan started',
  'scan.finished': 'Scan finished',
  'removal.created': 'Removal request drafted',
  'removal.approved': 'Removal request approved',
  'removal.submitted': 'Removal request submitted',
  'removal.submitted_manually': 'Removal submission recorded',
  'removal.outcome': 'Removal outcome recorded',
  'removal.verified': 'Removal status re-checked',
  'removal.cancelled': 'Removal request cancelled',
  'removal.evidence_added': 'Evidence added',
  'contact.verified': 'Contact verified',
  'contact.added': 'Contact added',
  'consent.granted': 'Consent given',
  'consent.revoked': 'Consent withdrawn',
  'monitoring.enabled': 'Monitoring turned on',
  'monitoring.disabled': 'Monitoring turned off',
  'finding.status_changed': 'Finding updated',
};

router.get(
  '/dashboard',
  ah(async (req, res) => {
    const uid = req.user._id;
    const [findingCounts, removalCounts, lastScan, activeScan, activity] = await Promise.all([
      ExposureFinding.aggregate([
        { $match: { user: uid, status: { $ne: 'dismissed' } } },
        { $group: { _id: null, total: { $sum: 1 }, new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } }, demo: { $sum: { $cond: ['$isDemo', 1, 0] } } } },
      ]),
      RemovalRequest.aggregate([{ $match: { user: uid } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      ScanJob.findOne({ user: uid, finishedAt: { $ne: null } }).sort({ finishedAt: -1 }),
      ScanJob.findOne({ user: uid, status: { $in: ['queued', 'running'] } }).sort({ createdAt: -1 }),
      AuditLog.find({ user: uid, action: { $in: Object.keys(ACTIVITY_LABELS) } }).sort({ createdAt: -1 }).limit(12).lean(),
    ]);
    const rc = Object.fromEntries(removalCounts.map((r) => [r._id, r.n]));
    const f = findingCounts[0] || { total: 0, new: 0, demo: 0 };
    res.json({
      findings: { total: f.total, new: f.new, demo: f.demo },
      removals: {
        inProgress: (rc.awaiting_consent || 0) + (rc.ready_to_submit || 0) + (rc.submitting || 0) + (rc.submitted || 0) + (rc.awaiting_response || 0),
        removed: rc.removed || 0,
        failed: (rc.rejected || 0) + (rc.unable_to_remove || 0),
      },
      lastScan: lastScan ? serializeJob(lastScan) : null,
      activeScan: activeScan ? serializeJob(activeScan) : null,
      monitoring: req.user.monitoring,
      activity: activity.map((a) => ({ id: String(a._id), action: a.action, label: ACTIVITY_LABELS[a.action], at: a.createdAt, meta: a.meta?.status || a.meta?.outcome || a.meta?.scope || null })),
    });
  }),
);

export default router;
