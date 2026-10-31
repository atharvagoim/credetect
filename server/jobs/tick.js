import { env } from '../config/env.js';
import { ExposureFinding, ScanJob, User } from '../models/index.js';
import { FREQUENCY_DAYS } from '../routes/account.js';
import { expirePlans } from '../services/billing.js';
import { activeScopes } from '../services/consent.js';
import { recordEvent } from '../services/events.js';
import { processFollowUps } from '../services/removals.js';
import { createScanJob, processQueue } from '../services/scanner.js';

/**
 * The background worker. Triggered by Vercel Cron (see vercel.json) or any
 * scheduler that can call GET /api/cron/tick with `Authorization: Bearer CRON_SECRET`.
 * Every step is idempotent and lease-based, so overlapping runs are safe.
 */
export async function runTick({ budgetMs = 50_000 } = {}) {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);
  const summary = { enqueued: 0, processed: 0, followUps: 0, expiredPlans: 0, cleaned: 0, releasedLocks: 0 };

  // 1. Release jobs whose worker died mid-run.
  const released = await ScanJob.updateMany({ status: 'running', lockedUntil: { $lt: new Date() } }, { $set: { status: 'queued', lockedUntil: null } });
  summary.releasedLocks = released.modifiedCount;

  // 2. Enqueue due monitoring scans (claim by advancing nextRunAt first).
  while (left() > budgetMs * 0.6) {
    const now = new Date();
    const user = await User.findOneAndUpdate(
      { 'monitoring.enabled': true, 'monitoring.nextRunAt': { $lte: now }, emailVerifiedAt: { $ne: null } },
      { $set: { 'monitoring.nextRunAt': new Date(Date.now() + 3600_000) } },
      { returnDocument: 'after' },
    );
    if (!user) break;
    const days = FREQUENCY_DAYS[user.monitoring.frequency] || 30;
    try {
      const scopes = await activeScopes(user._id);
      if (!scopes.includes('monitoring') || !scopes.includes('scanning')) {
        await User.updateOne({ _id: user._id }, { $set: { 'monitoring.enabled': false, 'monitoring.nextRunAt': null } });
        continue;
      }
      await createScanJob(user, { trigger: 'monitoring' });
      summary.enqueued += 1;
    } catch (err) {
      await recordEvent({ level: 'warn', kind: 'job_failed', source: 'monitoring', message: `Could not enqueue monitoring scan: ${err.code || err.message}` });
    }
    await User.updateOne({ _id: user._id }, { $set: { 'monitoring.nextRunAt': new Date(Date.now() + days * 864e5) } });
  }

  // 3. Run queued scans (including retries of transient failures).
  summary.processed = await processQueue({ budgetMs: Math.max(0, left() * 0.6) });

  // 4. Removal follow-ups and verification re-checks.
  summary.followUps = await processFollowUps({ budgetMs: Math.max(0, left() * 0.7) });

  // 5. Plans and retention.
  summary.expiredPlans = await expirePlans();
  const dismissedCutoff = new Date(Date.now() - env.DISMISSED_RETENTION_DAYS * 864e5);
  const staleCutoff = new Date(Date.now() - env.FINDING_RETENTION_DAYS * 864e5);
  const r1 = await ExposureFinding.deleteMany({ status: 'dismissed', updatedAt: { $lt: dismissedCutoff }, removalStatus: { $in: ['none', 'removed'] } });
  const r2 = await ExposureFinding.deleteMany({ lastSeenAt: { $lt: staleCutoff }, removalStatus: { $in: ['none', 'removed'] } });
  summary.cleaned = r1.deletedCount + r2.deletedCount;
  summary.ms = Date.now() - started;
  return summary;
}
