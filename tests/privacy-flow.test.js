import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { agent, app, codeFrom, onboardedUser } from './helpers.js';
import { testHooks } from '../server/services/messaging.js';
import { AuditLog, ExposureFinding, RemovalRequest, User, VerifiedContact } from '../server/models/index.js';

async function scanAndGetFindings(a) {
  const scan = await a.post('/api/scans').send({ sources: ['demo'] });
  expect(scan.status).toBe(201);
  expect(scan.body.job.status).toBe('completed');
  const f = await a.get('/api/findings');
  return f.body.items;
}

describe('contacts and consent', () => {
  it('encrypts contact details at rest and masks them in responses', async () => {
    const a = await onboardedUser();
    const stored = await VerifiedContact.findOne({ type: 'phone' });
    expect(stored.valueEnc).not.toContain('9876543210');
    const p = await a.get('/api/profile');
    const phone = p.body.contacts.find((c) => c.type === 'phone');
    expect(phone.masked).toBe('+91 ••••• •3210');
    expect(JSON.stringify(p.body)).not.toContain('9876543210');
  });

  it('normalises Indian numbers and rejects invalid ones', async () => {
    const a = await onboardedUser('n@example.com', { phone: null });
    expect((await a.post('/api/contacts').send({ type: 'phone', value: '12345' })).status).toBe(400);
    expect((await a.post('/api/contacts').send({ type: 'phone', value: '09123456789' })).status).toBe(201);
    expect((await a.post('/api/contacts').send({ type: 'phone', value: '+91 91234 56789' })).status).toBe(409);
  });

  it('rejects wrong verification codes and stops after five attempts', async () => {
    const a = await onboardedUser('otp@example.com', { phone: null });
    const c = await a.post('/api/contacts').send({ type: 'phone', value: '9000000001' });
    const real = codeFrom(testHooks.sent.at(-1).text);
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await a.post(`/api/contacts/${c.body.contact.id}/verify`).send({ code: wrong })).status).toBe(400);
    const locked = await a.post(`/api/contacts/${c.body.contact.id}/verify`).send({ code: real });
    expect(locked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('refuses to scan without consent', async () => {
    const a = await onboardedUser();
    await a.delete('/api/consents/scanning').expect(200);
    const r = await a.post('/api/scans').send({});
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CONSENT_REQUIRED');
  });
});

describe('scanning and findings', () => {
  it('runs a scan, persists labelled demo findings and deduplicates on rescan', async () => {
    const a = await onboardedUser();
    const items = await scanAndGetFindings(a);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((f) => f.isDemo)).toBe(true);
    expect(items.every((f) => f.sourceUrl.includes('.example/'))).toBe(true);
    const count = await ExposureFinding.countDocuments();
    const again = await a.post('/api/scans').send({ sources: ['demo'] });
    expect(again.body.job.newFindings).toBe(0);
    expect(await ExposureFinding.countDocuments()).toBe(count);
  });

  it('isolates findings, scans and removals between users', async () => {
    const alice = await onboardedUser('alice@example.com', { phone: '9811111111', name: 'Alice Rao' });
    const bob = await onboardedUser('bob@example.com', { phone: '9822222222', name: 'Bob Iyer' });
    const aliceFindings = await scanAndGetFindings(alice);
    const scans = await alice.get('/api/scans');
    const fid = aliceFindings[0].id;

    expect((await bob.get(`/api/findings/${fid}`)).status).toBe(404);
    expect((await bob.patch(`/api/findings/${fid}`).send({ status: 'dismissed' })).status).toBe(404);
    expect((await bob.get(`/api/scans/${scans.body.items[0].id}`)).status).toBe(404);
    expect((await bob.get('/api/findings')).body.items).toHaveLength(0);
    expect((await bob.post('/api/removal-requests').send({ findingId: fid })).status).toBe(404);

    const rr = await alice.post('/api/removal-requests').send({ findingId: fid });
    expect((await bob.get(`/api/removal-requests/${rr.body.removal.id}`)).status).toBe(404);
    expect((await bob.post(`/api/removal-requests/${rr.body.removal.id}/approve`).send({ confirm: true })).status).toBe(404);
  });

  it('dashboard reflects stored data', async () => {
    const a = await onboardedUser();
    const empty = await a.get('/api/dashboard');
    expect(empty.body.findings.total).toBe(0);
    expect(empty.body.lastScan).toBeNull();
    const items = await scanAndGetFindings(a);
    const d = await a.get('/api/dashboard');
    expect(d.body.findings.total).toBe(items.length);
    expect(d.body.findings.new).toBe(items.length);
    expect(d.body.lastScan.status).toBe('completed');
  });

  it('filters findings and validates query params', async () => {
    const a = await onboardedUser();
    await scanAndGetFindings(a);
    const phones = await a.get('/api/findings?dataType=phone');
    expect(phones.body.items.every((f) => f.dataType === 'phone')).toBe(true);
    expect((await a.get('/api/findings?dataType=passport')).status).toBe(400);
    expect((await a.get('/api/findings?limit=1000')).status).toBe(400);
  });
});

describe('removal workflow', () => {
  it('requires approval, prevents double submission, and is auditable', async () => {
    const a = await onboardedUser();
    const [finding] = await scanAndGetFindings(a);
    const created = await a.post('/api/removal-requests').send({ findingId: finding.id });
    expect(created.status).toBe(201);
    const id = created.body.removal.id;
    expect(created.body.removal.status).toBe('awaiting_consent');
    expect(created.body.removal.body).toContain(finding.sourceUrl);

    // Duplicate open request for the same finding
    expect((await a.post('/api/removal-requests').send({ findingId: finding.id })).status).toBe(409);
    // Cannot submit before approval
    expect((await a.post(`/api/removal-requests/${id}/submit`)).status).toBe(409);

    const approved = await a.post(`/api/removal-requests/${id}/approve`).send({ confirm: true });
    expect(approved.body.removal.status).toBe('ready_to_submit');
    const [s1, s2] = await Promise.all([a.post(`/api/removal-requests/${id}/submit`), a.post(`/api/removal-requests/${id}/submit`)]);
    expect([s1.status, s2.status].sort()).toEqual([200, 409]);
    const done = s1.status === 200 ? s1 : s2;
    expect(done.body.removal.status).toBe('awaiting_response');
    expect(done.body.removal.referenceId).toMatch(/^DEMO-/);
    expect(done.body.removal.history.map((h) => h.note).join(' ')).toContain('Nothing was sent');

    // Cannot mark removed without evidence
    const noEvidence = await a.post(`/api/removal-requests/${id}/outcome`).send({ outcome: 'removed' });
    expect(noEvidence.body.error.code).toBe('EVIDENCE_REQUIRED');

    // Automated recheck (demo source supports verification)
    const re = await a.post(`/api/removal-requests/${id}/recheck`);
    expect(re.body.result).toBe('absent');
    expect(re.body.removal.status).toBe('removed');
    const f = await a.get(`/api/findings/${finding.id}`);
    expect(f.body.finding.removalStatus).toBe('removed');

    const actions = (await AuditLog.find({ targetId: id })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['removal.created', 'removal.approved', 'removal.submitted', 'removal.verified']));
    // Audit metadata never contains the request text or contact values
    const logs = JSON.stringify(await AuditLog.find().lean());
    expect(logs).not.toContain('9876543210');
    expect(logs).not.toContain('Grievance Officer');
  });

  it('encrypts request bodies at rest', async () => {
    const a = await onboardedUser();
    const [finding] = await scanAndGetFindings(a);
    await a.post('/api/removal-requests').send({ findingId: finding.id });
    const raw = await RemovalRequest.findOne().lean();
    expect(raw.bodyEnc.startsWith('v1.')).toBe(true);
    expect(raw.bodyEnc).not.toContain('Grievance');
  });

  it('records manual submissions and rejected outcomes', async () => {
    const a = await onboardedUser();
    const [finding] = await scanAndGetFindings(a);
    const { body } = await a.post('/api/removal-requests').send({ findingId: finding.id });
    const id = body.removal.id;
    await a.post(`/api/removal-requests/${id}/approve`).send({ confirm: true });
    const m = await a.post(`/api/removal-requests/${id}/mark-submitted`).send({ referenceId: 'TICKET-42' });
    expect(m.body.removal.status).toBe('awaiting_response');
    await a.post(`/api/removal-requests/${id}/evidence`).send({ kind: 'response', text: 'We cannot remove public records.' }).expect(200);
    const out = await a.post(`/api/removal-requests/${id}/outcome`).send({ outcome: 'rejected', note: 'Refused' });
    expect(out.body.removal.status).toBe('rejected');
    expect((await a.get(`/api/findings/${finding.id}`)).body.finding.removalStatus).toBe('rejected');
  });
});

describe('monitoring and background worker', () => {
  it('schedules monitoring, runs it via cron, and stops when consent is revoked', async () => {
    const a = await onboardedUser();
    const on = await a.patch('/api/monitoring').send({ enabled: true, frequency: 'monthly' });
    expect(on.body.monitoring.enabled).toBe(true);
    expect((await a.patch('/api/monitoring').send({ enabled: true, frequency: 'weekly' })).status).toBe(402);

    await User.updateOne({}, { $set: { 'monitoring.nextRunAt': new Date(Date.now() - 1000) } });
    expect((await request(app).get('/api/cron/tick')).status).toBe(401);
    const tick = await request(app).get('/api/cron/tick').set('Authorization', 'Bearer test-cron-secret');
    expect(tick.status).toBe(200);
    expect(tick.body.enqueued).toBe(1);
    expect(tick.body.processed).toBe(1);
    const scans = await a.get('/api/scans');
    expect(scans.body.items[0].trigger).toBe('monitoring');
    const notes = await a.get('/api/notifications');
    expect(notes.body.items[0].type).toBe('new_findings');

    await a.delete('/api/consents/monitoring').expect(200);
    const m = await a.get('/api/monitoring');
    expect(m.body.monitoring.enabled).toBe(false);
  });

  it('unsubscribes with a signed link and rejects tampered tokens', async () => {
    const a = await onboardedUser();
    await a.patch('/api/monitoring').send({ enabled: true });
    await User.updateOne({}, { $set: { 'monitoring.nextRunAt': new Date(Date.now() - 1000) } });
    await request(app).get('/api/cron/tick').set('Authorization', 'Bearer test-cron-secret');
    const mail = testHooks.sent.find((m) => m.text.includes('unsubscribe'));
    const url = new URL(mail.text.match(/https?:\/\/\S*unsubscribe\S*/)[0]);
    const bad = await request(app).get(url.pathname + url.search.replace(/.$/, 'x'));
    expect(bad.headers.location).toContain('invalid');
    const ok = await request(app).get(url.pathname + url.search);
    expect(ok.headers.location).toContain('status=ok');
    expect((await User.findOne()).notificationPrefs.email).toBe(false);
  });
});

describe('export and deletion', () => {
  it('exports the user’s own data', async () => {
    const a = await onboardedUser();
    await scanAndGetFindings(a);
    const r = await a.get('/api/profile/export');
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('attachment');
    expect(r.body.contacts.find((c) => c.type === 'phone').value).toBe('+919876543210');
    expect(r.body.findings.length).toBeGreaterThan(0);
  });

  it('deletes the account and personal data, keeping only detached audit records', async () => {
    const a = await onboardedUser();
    await scanAndGetFindings(a);
    expect((await a.delete('/api/profile').send({ password: 'wrong', confirm: 'DELETE' })).status).toBe(401);
    const r = await a.delete('/api/profile').send({ password: 'correct-horse-42', confirm: 'DELETE' });
    expect(r.status).toBe(200);
    expect(await User.countDocuments()).toBe(0);
    expect(await VerifiedContact.countDocuments()).toBe(0);
    expect(await ExposureFinding.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ user: { $ne: null } })).toBe(0);
    expect((await a.get('/api/profile')).status).toBe(401);
  });
});

describe('admin', () => {
  it('denies non-admins and returns no personal data to admins', async () => {
    const user = await onboardedUser();
    await scanAndGetFindings(user);
    expect((await user.get('/api/admin/overview')).status).toBe(403);

    const admin = await onboardedUser('admin@example.com', { phone: '9833333333', name: 'Admin Person' });
    const o = await admin.get('/api/admin/overview');
    expect(o.status).toBe(200);
    expect(o.body.findings.demo).toBeGreaterThan(0);
    const jobs = await admin.get('/api/admin/jobs');
    const blob = JSON.stringify(jobs.body);
    expect(blob).not.toContain('asha@example.com');
    expect(blob).not.toContain('9876543210');
    expect(jobs.body.items[0].userRef).toMatch(/^[a-f0-9]{10}$/);

    const off = await admin.patch('/api/admin/sources/demo').send({ enabled: false });
    expect(off.body.source.enabled).toBe(false);
    const scan = await user.post('/api/scans').send({ sources: ['demo'] });
    expect(scan.status).toBe(400);
  });
});

describe('billing', () => {
  it('reports billing as disabled when not configured and never fakes a purchase', async () => {
    const plans = await request(app).get('/api/billing/plans');
    expect(plans.body.billingEnabled).toBe(false);
    const a = await onboardedUser();
    const r = await a.post('/api/billing/checkout').send({ plan: 'cleanup' });
    expect(r.status).toBe(503);
    expect((await User.findOne()).plan.tier).toBe('free');
  });

  it('rejects unsigned webhooks', async () => {
    const a = await agent();
    const r = await a.raw.post('/api/billing/webhook').send({ event: 'payment.captured' });
    expect(r.status).toBe(503);
  });
});
