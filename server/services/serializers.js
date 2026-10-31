import { decrypt } from '../utils/crypto.js';

export function serializeUser(u) {
  return {
    id: String(u._id),
    email: u.email,
    role: u.role,
    emailVerified: Boolean(u.emailVerifiedAt),
    onboardingCompleted: Boolean(u.onboardingCompletedAt),
    plan: { tier: u.plan?.tier || 'free', status: u.plan?.status, currentPeriodEnd: u.plan?.currentPeriodEnd },
    createdAt: u.createdAt,
  };
}

export function serializeContact(c) {
  return { id: String(c._id), type: c.type, masked: c.masked, verified: Boolean(c.verifiedAt), verifiedAt: c.verifiedAt, scanEnabled: c.scanEnabled, createdAt: c.createdAt };
}

export function serializeFinding(f) {
  return {
    id: String(f._id),
    sourceKey: f.sourceKey,
    sourceName: f.sourceName,
    sourceUrl: f.sourceUrl,
    domain: f.domain,
    category: f.category,
    dataType: f.dataType,
    matchedValueMasked: f.matchedValueMasked,
    confidence: f.confidence,
    evidenceSummary: f.evidenceSummary,
    isDemo: f.isDemo,
    removable: f.removable,
    status: f.status,
    removalStatus: f.removalStatus,
    firstSeenAt: f.firstSeenAt,
    lastSeenAt: f.lastSeenAt,
    scanJob: f.scanJob ? String(f.scanJob) : null,
  };
}

export function serializeJob(j) {
  return {
    id: String(j._id),
    status: j.status,
    trigger: j.trigger,
    sources: j.sources,
    dataTypes: j.dataTypes,
    urlCount: j.urls?.length || 0,
    attempts: j.attempts,
    newFindings: j.newFindings,
    totalFindings: j.totalFindings,
    error: j.error,
    createdAt: j.createdAt,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  };
}

export function serializeRemoval(r, { includeBody = false } = {}) {
  return {
    id: String(r._id),
    finding: r.finding?._id ? String(r.finding._id) : String(r.finding),
    sourceKey: r.sourceKey,
    sourceName: r.sourceName,
    status: r.status,
    channel: r.channel,
    isDemo: r.isDemo,
    recipientEmail: r.recipientEmail,
    formUrl: r.formUrl,
    instructions: r.instructions,
    subject: r.subject,
    ...(includeBody ? { body: decrypt(r.bodyEnc) } : {}),
    approvedAt: r.approvedAt,
    submittedAt: r.submittedAt,
    referenceId: r.referenceId,
    followUpAt: r.followUpAt,
    followUps: r.followUps,
    lastError: r.lastError,
    history: r.history,
    evidence: (r.evidence || []).map((e) => ({ id: String(e._id), kind: e.kind, text: e.text, url: e.url, at: e.at, actor: e.actor })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    closedAt: r.closedAt,
  };
}
