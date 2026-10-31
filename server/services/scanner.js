import { adapters, getAdapter } from '../adapters/index.js';
import { env } from '../config/env.js';
import { ExposureFinding, ScanJob, SourceAdapter, User } from '../models/index.js';
import { hmac } from '../utils/crypto.js';
import { AppError, badRequest } from '../utils/errors.js';
import { hit } from '../middleware/rateLimit.js';
import { getScanIdentity } from './contacts.js';
import { requireConsent } from './consent.js';
import { audit, recordEvent } from './events.js';
import { notify } from './notifications.js';
import { validatePublicUrl } from '../utils/safeFetch.js';

let configsReady = null;

/** Make sure every code-defined adapter has an admin-editable config document. */
export function ensureSourceConfigs() {
  configsReady ??= Promise.all(
    adapters.map((a) =>
      SourceAdapter.updateOne(
        { key: a.key },
        {
          $setOnInsert: {
            key: a.key,
            name: a.name,
            description: a.description,
            enabled: true,
            removal: { channel: a.defaultRemoval.channel, instructions: a.defaultRemoval.instructions },
          },
        },
        { upsert: true },
      ),
    ),
  ).catch((e) => {
    configsReady = null;
    throw e;
  });
  return configsReady;
}

export const resetSourceConfigCache = () => (configsReady = null);

export async function listSources() {
  await ensureSourceConfigs();
  const configs = await SourceAdapter.find().lean();
  return adapters.map((a) => {
    const cfg = configs.find((c) => c.key === a.key) || {};
    const availability = a.isAvailable();
    return {
      key: a.key,
      name: a.name,
      description: a.description,
      kind: a.kind,
      isDemo: a.isDemo,
      dataTypes: a.dataTypes,
      requiresUrls: Boolean(a.requiresUrls),
      supportsVerification: a.supportsVerification,
      enabled: cfg.enabled !== false,
      available: availability.ok,
      unavailableReason: availability.ok ? null : availability.reason,
      usable: cfg.enabled !== false && availability.ok,
      config: cfg,
    };
  });
}

function cleanUrl(raw) {
  const u = validatePublicUrl(raw);
  return u.toString();
}

export async function createScanJob(user, { sources, urls = [], trigger = 'manual' }) {
  await requireConsent(user._id, ['data_processing', 'scanning']);
  const identity = await getScanIdentity(user._id);
  if (!identity.contacts.length && !identity.fullName) throw badRequest('Add and verify at least one contact detail before scanning.');

  const all = await listSources();
  let selected = sources?.length ? all.filter((s) => sources.includes(s.key)) : all.filter((s) => s.usable && !s.requiresUrls);
  if (urls.length) selected = [...selected.filter((s) => s.key !== 'url_check'), ...all.filter((s) => s.key === 'url_check')];
  selected = selected.filter((s) => s.usable);
  if (!selected.length) throw badRequest('No supported sources are currently available for this scan.');

  const cleanedUrls = [...new Set(urls.map(cleanUrl))];
  if (selected.some((s) => s.requiresUrls) && !cleanedUrls.length) throw badRequest('Add at least one page URL to check.');

  if (trigger === 'manual') {
    const active = await ScanJob.findOne({ user: user._id, status: { $in: ['queued', 'running'] }, createdAt: { $gt: new Date(Date.now() - 10 * 60_000) } });
    if (active) throw new AppError(409, 'SCAN_IN_PROGRESS', 'A scan is already in progress.', { jobId: String(active._id) });
    if ((user.plan?.tier || 'free') === 'free') {
      const recent = await ScanJob.countDocuments({ user: user._id, trigger: 'manual', createdAt: { $gt: new Date(Date.now() - 30 * 864e5) } });
      if (recent >= env.FREE_SCANS_PER_30_DAYS) throw new AppError(402, 'PLAN_LIMIT', `The free plan includes ${env.FREE_SCANS_PER_30_DAYS} scans every 30 days. Upgrade for more.`);
    }
  }

  const job = await ScanJob.create({
    user: user._id,
    trigger,
    dataTypes: user.scanDataTypes,
    requestedSources: selected.map((s) => s.key),
    urls: cleanedUrls,
    sources: selected.map((s) => ({ key: s.key, status: 'pending' })),
  });
  await audit(user._id, 'scan.created', { targetType: 'ScanJob', targetId: job._id, meta: { trigger, sources: job.requestedSources, urlCount: cleanedUrls.length } });
  return job;
}

const withTimeout = (ms, fn) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return Promise.race([
    fn(ctrl.signal),
    new Promise((_, reject) => ctrl.signal.addEventListener('abort', () => reject(Object.assign(new Error('Source timed out'), { code: 'TIMEOUT' })))),
  ]).finally(() => clearTimeout(timer));
};

async function upsertFinding(job, adapter, r) {
  const url = r.sourceUrl;
  const domain = r.domain || new URL(url).hostname;
  const dedupeKey = hmac(`${job.user}|${adapter.key}|${url}|${r.dataType}|${r.contactId || 'name'}`);
  const now = new Date();
  const res = await ExposureFinding.findOneAndUpdate(
    { user: job.user, dedupeKey },
    {
      $set: { lastSeenAt: now, confidence: r.confidence, evidenceSummary: r.evidenceSummary, scanJob: job._id, lastCheckedAbsentAt: null },
      $setOnInsert: {
        user: job.user,
        contact: r.contactId || null,
        sourceKey: adapter.key,
        sourceName: r.sourceName || adapter.name,
        sourceUrl: url,
        domain,
        category: r.category || adapter.kind,
        dataType: r.dataType,
        matchedValueMasked: r.matchedValueMasked || '',
        isDemo: Boolean(adapter.isDemo),
        removable: r.removable !== false,
        dedupeKey,
        firstSeenAt: now,
      },
    },
    { upsert: true, returnDocument: 'after', includeResultMetadata: true },
  );
  const created = !res.lastErrorObject?.updatedExisting;
  const doc = res.value;
  // A previously removed listing that reappears is surfaced again.
  if (!created && doc.removalStatus === 'removed') {
    doc.removalStatus = 'none';
    doc.status = 'new';
    await doc.save();
    return { created: true, reappeared: true };
  }
  return { created };
}

const TRANSIENT = new Set(['timeout', 'rate_limited', 'error']);

export async function runJob(job) {
  const user = await User.findById(job.user);
  if (!user) {
    job.status = 'cancelled';
    job.error = 'Account no longer exists';
    await job.save();
    return job;
  }
  const identity = await getScanIdentity(user._id);
  await ensureSourceConfigs();
  const configs = Object.fromEntries((await SourceAdapter.find().lean()).map((c) => [c.key, c]));

  let newCount = 0;
  let total = 0;
  for (const run of job.sources) {
    if (run.status === 'ok' || run.status === 'skipped') continue;
    const adapter = getAdapter(run.key);
    const cfg = configs[run.key] || {};
    const started = Date.now();
    if (!adapter || cfg.enabled === false || !adapter.isAvailable().ok) {
      Object.assign(run, { status: 'skipped', message: 'Source disabled or not configured' });
      continue;
    }
    const { count } = await hit(`source:${adapter.key}`, 60_000);
    if (count > (cfg.rateLimitPerMinute || 30)) {
      Object.assign(run, { status: 'rate_limited', message: 'Source busy; will retry' });
      continue;
    }
    try {
      const results = await withTimeout((cfg.timeoutMs || 10_000) + (adapter.requiresUrls ? job.urls.length * 12_000 : 0), (signal) => adapter.search({ identity, urls: job.urls, signal }));
      let found = 0;
      for (const r of results) {
        if (!identity.contacts.some((c) => c.id === r.contactId) && r.dataType !== 'name') continue; // only verified identifiers
        const { created } = await upsertFinding(job, adapter, r);
        found += 1;
        if (created) newCount += 1;
      }
      total += found;
      const pageErrors = results.errors || [];
      Object.assign(run, {
        status: 'ok',
        findings: found,
        message: pageErrors.length ? pageErrors.map((e) => `${safeHost(e.url)}: ${e.message}`).join('; ').slice(0, 300) : undefined,
      });
      await SourceAdapter.updateOne({ key: adapter.key }, { $inc: { 'stats.runs': 1 }, $set: { 'stats.lastRunAt': new Date() } });
    } catch (err) {
      const status = err.code === 'TIMEOUT' ? 'timeout' : err.code === 'RATE_LIMITED' ? 'rate_limited' : 'error';
      Object.assign(run, { status, message: status === 'error' ? 'Source unavailable' : err.message });
      await SourceAdapter.updateOne(
        { key: adapter.key },
        { $inc: { 'stats.runs': 1, 'stats.errors': 1 }, $set: { 'stats.lastRunAt': new Date(), 'stats.lastErrorAt': new Date(), 'stats.lastError': String(err.message).slice(0, 300) } },
      );
      await recordEvent({ level: 'error', kind: 'adapter_error', source: adapter.key, message: String(err.message).slice(0, 300), meta: { jobId: String(job._id), status } });
    }
    run.durationMs = Date.now() - started;
  }

  job.newFindings += newCount;
  job.totalFindings = (job.totalFindings || 0) + total;
  const transient = job.sources.filter((s) => TRANSIENT.has(s.status));
  const ok = job.sources.filter((s) => s.status === 'ok');
  if (transient.length && job.attempts < job.maxAttempts) {
    // Retry only the failed sources later with exponential backoff.
    job.status = 'queued';
    job.runAfter = new Date(Date.now() + 2 ** job.attempts * 60_000);
    for (const s of transient) s.status = 'pending';
  } else {
    job.status = transient.length ? (ok.length ? 'partial' : 'failed') : 'completed';
    job.finishedAt = new Date();
    if (job.status === 'failed') job.error = 'All sources failed. Try again later.';
  }
  job.lockedUntil = null;
  await job.save();

  if (job.finishedAt) {
    if (job.trigger === 'monitoring') await User.updateOne({ _id: user._id }, { $set: { 'monitoring.lastRunAt': new Date() } });
    if (job.newFindings > 0) {
      await notify(user, {
        type: 'new_findings',
        title: `${job.newFindings} new finding${job.newFindings === 1 ? '' : 's'}`,
        body: `A ${job.trigger === 'monitoring' ? 'scheduled' : ''} scan found ${job.newFindings} new place${job.newFindings === 1 ? '' : 's'} where your details appear. Review them and decide what to request removal for.`.replace('A  scan', 'A scan'),
        link: '/app/findings?status=new',
        pref: 'newFindings',
      });
    } else if (job.status === 'failed') {
      await notify(user, { type: 'scan_failed', title: 'Scan could not complete', body: 'Supported sources were unavailable. We will not retry automatically; run the scan again later.', link: `/app/scans` });
      await recordEvent({ level: 'error', kind: 'job_failed', source: 'scanner', message: 'Scan job failed', meta: { jobId: String(job._id) } });
    }
    await audit(user._id, 'scan.finished', { actor: 'system', targetType: 'ScanJob', targetId: job._id, meta: { status: job.status, newFindings: job.newFindings } });
  }
  return job;
}

const safeHost = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return 'url';
  }
};

/** Atomically claim a job (lease) so concurrent workers/cron never run it twice. */
export async function claimJob(filter = {}) {
  const now = new Date();
  return ScanJob.findOneAndUpdate(
    { ...filter, status: { $in: ['queued', 'running'] }, runAfter: { $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
    { $set: { status: 'running', lockedUntil: new Date(Date.now() + 120_000), startedAt: now }, $inc: { attempts: 1 } },
    { returnDocument: 'after', sort: { runAfter: 1 } },
  );
}

export async function processQueue({ budgetMs = 40_000 } = {}) {
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  while (Date.now() < deadline) {
    const job = await claimJob();
    if (!job) break;
    try {
      await runJob(job);
    } catch (err) {
      job.status = job.attempts < job.maxAttempts ? 'queued' : 'failed';
      job.runAfter = new Date(Date.now() + 5 * 60_000);
      job.lockedUntil = null;
      job.error = 'Internal error while scanning';
      await job.save();
      await recordEvent({ level: 'error', kind: 'job_failed', source: 'scanner', message: String(err.message).slice(0, 300), meta: { jobId: String(job._id) } });
    }
    processed += 1;
  }
  return processed;
}
