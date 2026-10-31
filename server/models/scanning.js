import mongoose from 'mongoose';

const { Schema } = mongoose;

export const JOB_STATUSES = ['queued', 'running', 'completed', 'partial', 'failed', 'cancelled'];

const sourceRunSchema = new Schema(
  {
    key: String,
    status: { type: String, enum: ['pending', 'ok', 'skipped', 'error', 'rate_limited', 'timeout'], default: 'pending' },
    findings: { type: Number, default: 0 },
    durationMs: Number,
    message: { type: String, maxlength: 300 },
  },
  { _id: false },
);

const scanJobSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: JOB_STATUSES, default: 'queued' },
    trigger: { type: String, enum: ['manual', 'monitoring'], default: 'manual' },
    dataTypes: [String],
    requestedSources: [String],
    // URLs the user asked us to check; scheme+host+path only, no query strings.
    urls: { type: [String], default: [] },
    sources: [sourceRunSchema],
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lockedUntil: { type: Date, default: null },
    runAfter: { type: Date, default: Date.now },
    startedAt: Date,
    finishedAt: Date,
    newFindings: { type: Number, default: 0 },
    totalFindings: { type: Number, default: 0 },
    error: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
scanJobSchema.index({ user: 1, createdAt: -1 });
scanJobSchema.index({ status: 1, runAfter: 1 });

export const FINDING_STATUSES = ['new', 'reviewed', 'confirmed', 'dismissed'];
export const REMOVAL_STATUSES = ['none', 'in_progress', 'removed', 'rejected', 'unable_to_remove'];

const findingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scanJob: { type: Schema.Types.ObjectId, ref: 'ScanJob' },
    contact: { type: Schema.Types.ObjectId, ref: 'VerifiedContact', default: null },
    sourceKey: { type: String, required: true },
    sourceName: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    domain: { type: String, required: true },
    category: { type: String, enum: ['listing', 'breach', 'page'], default: 'listing' },
    dataType: { type: String, enum: ['email', 'phone', 'name'], required: true },
    matchedValueMasked: { type: String, default: '' },
    confidence: { type: Number, min: 0, max: 1, required: true },
    evidenceSummary: { type: String, maxlength: 1000 },
    isDemo: { type: Boolean, default: false },
    removable: { type: Boolean, default: true },
    dedupeKey: { type: String, required: true },
    status: { type: String, enum: FINDING_STATUSES, default: 'new' },
    removalStatus: { type: String, enum: REMOVAL_STATUSES, default: 'none' },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    lastCheckedAbsentAt: { type: Date, default: null },
  },
  { timestamps: true },
);
findingSchema.index({ user: 1, dedupeKey: 1 }, { unique: true });
findingSchema.index({ user: 1, status: 1, createdAt: -1 });
findingSchema.index({ user: 1, sourceKey: 1 });

const removalEventSchema = new Schema(
  { status: String, at: { type: Date, default: Date.now }, note: { type: String, maxlength: 500 }, actor: { type: String, enum: ['user', 'system', 'admin'], default: 'system' } },
  { _id: false },
);
const evidenceSchema = new Schema(
  {
    kind: { type: String, enum: ['note', 'link', 'response', 'verification'], required: true },
    text: { type: String, maxlength: 4000 },
    url: { type: String, maxlength: 2000 },
    at: { type: Date, default: Date.now },
    actor: { type: String, enum: ['user', 'system'], default: 'user' },
  },
  { _id: true },
);

export const REMOVAL_REQUEST_STATUSES = [
  'awaiting_consent',
  'ready_to_submit',
  'submitting',
  'submitted',
  'awaiting_response',
  'removed',
  'rejected',
  'unable_to_remove',
  'cancelled',
];

const removalSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    finding: { type: Schema.Types.ObjectId, ref: 'ExposureFinding', required: true },
    sourceKey: { type: String, required: true },
    sourceName: String,
    status: { type: String, enum: REMOVAL_REQUEST_STATUSES, default: 'awaiting_consent' },
    channel: { type: String, enum: ['email', 'web_form', 'demo', 'none'], required: true },
    isDemo: { type: Boolean, default: false },
    recipientEmail: { type: String, default: '' },
    formUrl: { type: String, default: '' },
    instructions: { type: String, maxlength: 2000 },
    subject: { type: String, maxlength: 300 },
    bodyEnc: { type: String, required: true },
    bodyHash: String,
    approvedAt: Date,
    approvalConsent: { type: Schema.Types.ObjectId, ref: 'ConsentRecord' },
    submittedAt: Date,
    referenceId: { type: String, maxlength: 200 },
    followUpAt: Date,
    followUps: { type: Number, default: 0 },
    lastError: { type: String, maxlength: 300 },
    history: [removalEventSchema],
    evidence: [evidenceSchema],
    closedAt: Date,
  },
  { timestamps: true },
);
removalSchema.index({ user: 1, createdAt: -1 });
removalSchema.index({ status: 1, followUpAt: 1 });
// One open request per finding.
removalSchema.index(
  { finding: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['awaiting_consent', 'ready_to_submit', 'submitting', 'submitted', 'awaiting_response'] } } },
);

const sourceAdapterSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    enabled: { type: Boolean, default: true },
    rateLimitPerMinute: { type: Number, default: 30, min: 1, max: 600 },
    timeoutMs: { type: Number, default: 10000, min: 1000, max: 30000 },
    removal: {
      channel: { type: String, enum: ['email', 'web_form', 'demo', 'none'], default: 'web_form' },
      contactEmail: { type: String, default: '' },
      formUrl: { type: String, default: '' },
      instructions: { type: String, default: '' },
      subjectTemplate: { type: String, default: '' },
      bodyTemplate: { type: String, default: '' },
    },
    stats: {
      runs: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
      lastRunAt: Date,
      lastErrorAt: Date,
      lastError: { type: String, maxlength: 300 },
    },
  },
  { timestamps: true },
);
sourceAdapterSchema.index({ key: 1 }, { unique: true });

export const ScanJob = mongoose.models.ScanJob || mongoose.model('ScanJob', scanJobSchema);
export const ExposureFinding = mongoose.models.ExposureFinding || mongoose.model('ExposureFinding', findingSchema);
export const RemovalRequest = mongoose.models.RemovalRequest || mongoose.model('RemovalRequest', removalSchema);
export const SourceAdapter = mongoose.models.SourceAdapter || mongoose.model('SourceAdapter', sourceAdapterSchema);
