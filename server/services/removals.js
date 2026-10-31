import { z } from 'zod';
import { getAdapter } from '../adapters/index.js';
import { ExposureFinding, RemovalRequest, SourceAdapter, User, VerifiedContact } from '../models/index.js';
import { decrypt, encrypt, hmac, sha256 } from '../utils/crypto.js';
import { AppError, badRequest, notFound } from '../utils/errors.js';
import { validatePublicUrl } from '../utils/safeFetch.js';
import { getScanIdentity } from './contacts.js';
import { grantConsent } from './consent.js';
import { audit } from './events.js';
import { sendEmail } from './messaging.js';
import { notify } from './notifications.js';

export const DEFAULT_SUBJECT = 'Request to remove my personal information from {{domain}}';
export const DEFAULT_BODY = `Dear Grievance Officer / Privacy Team,

I am writing to request the removal of my personal information published on your website at:

{{url}}

The page displays my {{dataTypeLabel}}{{valueLine}} without my consent. I request that you remove this information and any copies of it, and stop publishing it in future.

I make this request under the grievance redressal mechanism of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, and as a Data Principal under the Digital Personal Data Protection Act, 2023, to the extent its provisions are in force.

Please confirm in writing once the information has been removed, and share a reference number for this request.

Regards,
{{fullName}}
{{replyEmail}}`;

const LABELS = { email: 'email address', phone: 'phone number', name: 'name' };
const FOLLOW_UP_DAYS = 14;
const MAX_FOLLOW_UPS = 3;

export function renderTemplate(tpl, vars) {
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? '').toString());
}

const push = (r, status, note, actor = 'user') => {
  r.status = status;
  r.history.push({ status, note, actor, at: new Date() });
};

async function loadOwned(user, id) {
  const r = await RemovalRequest.findOne({ _id: id, user: user._id });
  if (!r) throw notFound('Removal request not found');
  return r;
}

export async function createRemoval(user, { findingId, recipientEmail, formUrl }) {
  const finding = await ExposureFinding.findOne({ _id: findingId, user: user._id });
  if (!finding) throw notFound('Finding not found');
  const adapter = getAdapter(finding.sourceKey);
  if (!finding.removable || !adapter) {
    throw new AppError(400, 'NOT_REMOVABLE', adapter?.defaultRemoval?.instructions || 'This finding cannot be removed with a request.');
  }
  if (finding.status === 'dismissed') throw badRequest('This finding was dismissed. Restore it before requesting removal.');
  const open = await RemovalRequest.findOne({ finding: finding._id, status: { $in: ['awaiting_consent', 'ready_to_submit', 'submitting', 'submitted', 'awaiting_response'] } });
  if (open) throw new AppError(409, 'CONFLICT', 'A removal request for this finding is already open.', { removalId: String(open._id) });

  const cfg = (await SourceAdapter.findOne({ key: adapter.key }).lean()) || {};
  const removalCfg = cfg.removal || {};
  let channel = removalCfg.channel || adapter.defaultRemoval.channel;
  let recipient = (recipientEmail || removalCfg.contactEmail || '').trim().toLowerCase();
  let form = (formUrl || removalCfg.formUrl || '').trim();

  if (form) form = validatePublicUrl(form).toString();
  if (recipient && !z.string().email().safeParse(recipient).success) throw badRequest('Enter a valid recipient email address.');
  if (channel !== 'demo') {
    if (recipient) channel = 'email';
    else if (form) channel = 'web_form';
    else throw badRequest("Add the website's grievance/privacy email address or its official removal form URL.");
  }

  const identity = await getScanIdentity(user._id);
  const contact = finding.contact ? await VerifiedContact.findOne({ _id: finding.contact, user: user._id }) : null;
  const rawValue = contact ? decrypt(contact.valueEnc) : '';
  const vars = {
    domain: finding.domain,
    url: finding.sourceUrl,
    dataTypeLabel: LABELS[finding.dataType],
    valueLine: rawValue ? ` (${rawValue})` : '',
    fullName: identity.fullName || 'The data principal',
    replyEmail: user.email,
  };
  const subject = renderTemplate(removalCfg.subjectTemplate || DEFAULT_SUBJECT, vars).slice(0, 300);
  const body = renderTemplate(removalCfg.bodyTemplate || DEFAULT_BODY, vars);

  const removal = await RemovalRequest.create({
    user: user._id,
    finding: finding._id,
    sourceKey: adapter.key,
    sourceName: finding.sourceName,
    channel,
    isDemo: finding.isDemo,
    recipientEmail: channel === 'email' ? recipient : '',
    formUrl: form,
    instructions: removalCfg.instructions || adapter.defaultRemoval.instructions,
    subject,
    bodyEnc: encrypt(body),
    bodyHash: sha256(body),
    history: [
      { status: 'discovered', note: 'Finding identified', actor: 'system', at: finding.firstSeenAt },
      { status: 'awaiting_consent', note: 'Draft generated. Review it before approving.', actor: 'system' },
    ],
  });
  finding.removalStatus = 'in_progress';
  if (finding.status === 'new') finding.status = 'reviewed';
  await finding.save();
  await audit(user._id, 'removal.created', { targetType: 'RemovalRequest', targetId: removal._id, meta: { sourceKey: adapter.key, channel, findingId: String(finding._id) } });
  return removal;
}

export async function approveRemoval(user, id, { subject, body }) {
  const r = await loadOwned(user, id);
  if (r.status !== 'awaiting_consent') throw new AppError(409, 'INVALID_STATE', 'This request has already been approved or closed.');
  if (body !== undefined) {
    r.bodyEnc = encrypt(body);
    r.bodyHash = sha256(body);
  }
  if (subject !== undefined) r.subject = subject;
  // Consent is bound to this exact request text via its hash.
  const consent = await grantConsent(user._id, 'removal_submission', { subjectRef: `RemovalRequest:${r._id}:${r.bodyHash.slice(0, 16)}` });
  r.approvalConsent = consent._id;
  r.approvedAt = new Date();
  push(r, 'ready_to_submit', 'Approved by you. Ready to submit.');
  await r.save();
  await audit(user._id, 'removal.approved', { targetType: 'RemovalRequest', targetId: r._id, meta: { bodyHash: r.bodyHash.slice(0, 16) } });
  return r;
}

function markAwaiting(r, { referenceId, note, actor }) {
  r.submittedAt = new Date();
  if (referenceId) r.referenceId = referenceId;
  push(r, 'submitted', note, actor);
  r.followUpAt = new Date(Date.now() + (r.channel === 'demo' ? 60_000 : FOLLOW_UP_DAYS * 864e5));
  push(r, 'awaiting_response', `Follow-up scheduled for ${r.followUpAt.toISOString().slice(0, 10)}.`, 'system');
}

export async function submitRemoval(user, id) {
  // Atomic transition prevents double submission (double clicks, retries, concurrent tabs).
  const r = await RemovalRequest.findOneAndUpdate(
    { _id: id, user: user._id, status: 'ready_to_submit', approvedAt: { $ne: null } },
    { $set: { status: 'submitting' } },
    { returnDocument: 'after' },
  );
  if (!r) {
    const existing = await loadOwned(user, id);
    throw new AppError(409, 'INVALID_STATE', existing.status === 'awaiting_consent' ? 'Approve the request before submitting.' : 'This request is not ready to submit.');
  }
  try {
    if (r.channel === 'demo') {
      markAwaiting(r, { referenceId: `DEMO-${hmac(String(r._id)).slice(0, 8).toUpperCase()}`, note: 'Demo source: submission simulated. Nothing was sent.', actor: 'system' });
    } else if (r.channel === 'email') {
      const result = await sendEmail({ to: r.recipientEmail, subject: r.subject, text: decrypt(r.bodyEnc), replyTo: user.email });
      if (!result.delivered) {
        r.lastError = 'Email sending is not configured. Send the request yourself, then record it as submitted.';
        push(r, 'ready_to_submit', r.lastError, 'system');
        await r.save();
        throw new AppError(503, 'EMAIL_NOT_CONFIGURED', r.lastError);
      }
      const note = `Emailed to ${r.recipientEmail}.`;
      markAwaiting(r, { note, actor: 'system' });
    } else {
      push(r, 'ready_to_submit', 'This source uses a web form. Submit it there, then record the reference here.', 'system');
      await r.save();
      throw new AppError(400, 'MANUAL_SUBMISSION', 'This source requires its official web form. Open the form, submit the request, then record it as submitted.');
    }
    r.lastError = undefined;
    await r.save();
    await audit(user._id, 'removal.submitted', { targetType: 'RemovalRequest', targetId: r._id, meta: { channel: r.channel, isDemo: r.isDemo } });
    return r;
  } catch (err) {
    if (r.status === 'submitting') {
      r.status = 'ready_to_submit';
      r.lastError = 'Submission failed. Nothing was sent. Try again.';
      await r.save();
    }
    throw err;
  }
}

export async function recordManualSubmission(user, id, { referenceId, note }) {
  const r = await loadOwned(user, id);
  if (r.status !== 'ready_to_submit') throw new AppError(409, 'INVALID_STATE', 'Approve the request before recording a submission.');
  markAwaiting(r, { referenceId, note: note || 'You recorded that you submitted this request.', actor: 'user' });
  await r.save();
  await audit(user._id, 'removal.submitted_manually', { targetType: 'RemovalRequest', targetId: r._id, meta: { hasReference: Boolean(referenceId) } });
  return r;
}

export async function addEvidence(user, id, { kind, text, url }) {
  const r = await loadOwned(user, id);
  if (['cancelled'].includes(r.status)) throw new AppError(409, 'INVALID_STATE', 'This request is cancelled.');
  r.evidence.push({ kind, text, url, actor: 'user' });
  r.history.push({ status: r.status, note: `Evidence added (${kind}).`, actor: 'user' });
  await r.save();
  await audit(user._id, 'removal.evidence_added', { targetType: 'RemovalRequest', targetId: r._id, meta: { kind } });
  return r;
}

async function closeWithOutcome(r, outcome, note, actor) {
  push(r, outcome, note, actor);
  r.closedAt = new Date();
  r.followUpAt = null;
  await r.save();
  await ExposureFinding.updateOne({ _id: r.finding }, { $set: { removalStatus: outcome, ...(outcome === 'removed' ? { lastCheckedAbsentAt: new Date() } : {}) } });
}

export async function recordOutcome(user, id, { outcome, note }) {
  const r = await loadOwned(user, id);
  if (!['submitted', 'awaiting_response'].includes(r.status)) throw new AppError(409, 'INVALID_STATE', 'Only submitted requests can be closed with an outcome.');
  if (outcome === 'removed' && !r.evidence.some((e) => ['response', 'link', 'verification'].includes(e.kind))) {
    throw new AppError(400, 'EVIDENCE_REQUIRED', "Add the website's confirmation (their reply or a link) as evidence, or run a status check, before marking this removed.");
  }
  await closeWithOutcome(r, outcome, note || null, 'user');
  await audit(user._id, 'removal.outcome', { targetType: 'RemovalRequest', targetId: r._id, meta: { outcome } });
  return r;
}

export async function cancelRemoval(user, id) {
  const r = await loadOwned(user, id);
  if (!['awaiting_consent', 'ready_to_submit'].includes(r.status)) throw new AppError(409, 'INVALID_STATE', 'Requests that were already submitted cannot be cancelled here.');
  push(r, 'cancelled', 'Cancelled by you before submission.');
  r.closedAt = new Date();
  await r.save();
  await ExposureFinding.updateOne({ _id: r.finding }, { $set: { removalStatus: 'none' } });
  await audit(user._id, 'removal.cancelled', { targetType: 'RemovalRequest', targetId: r._id });
  return r;
}

/** Re-check the source, where the adapter supports verification. */
export async function verifyRemoval(r, actor = 'user') {
  const adapter = getAdapter(r.sourceKey);
  if (!adapter?.supportsVerification || !adapter.verifyRemoval) return { result: 'unsupported', removal: r };
  const finding = await ExposureFinding.findById(r.finding);
  if (!finding) return { result: 'unknown', removal: r };
  const identity = await getScanIdentity(r.user);
  const result = await adapter.verifyRemoval({ finding, removal: r, identity });
  if (result === 'absent') {
    r.evidence.push({ kind: 'verification', text: `Automated check on ${new Date().toISOString().slice(0, 10)}: your ${LABELS[finding.dataType]} no longer appears at the source URL.${r.isDemo ? ' (Demo source.)' : ''}`, url: finding.sourceUrl, actor: 'system' });
    await closeWithOutcome(r, 'removed', 'Confirmed by automated re-check of the source.', 'system');
  } else {
    r.history.push({ status: r.status, note: result === 'present' ? 'Re-check: the information is still visible.' : 'Re-check could not reach the page.', actor });
    await r.save();
  }
  await audit(r.user, 'removal.verified', { actor: actor === 'user' ? 'user' : 'system', targetType: 'RemovalRequest', targetId: r._id, meta: { result } });
  return { result, removal: r };
}

export async function processFollowUps({ budgetMs = 15_000 } = {}) {
  const deadline = Date.now() + budgetMs;
  let handled = 0;
  while (Date.now() < deadline) {
    // Claim by pushing followUpAt forward first, so overlapping runs can't double-process.
    const r = await RemovalRequest.findOneAndUpdate(
      { status: 'awaiting_response', followUpAt: { $lte: new Date() } },
      { $set: { followUpAt: new Date(Date.now() + 3600_000) } },
      { returnDocument: 'after' },
    );
    if (!r) break;
    handled += 1;
    const user = await User.findById(r.user);
    if (!user) continue;
    const { result } = await verifyRemoval(r, 'system');
    if (result === 'absent') {
      await notify(user, { type: 'removal_update', title: 'Removal confirmed', body: `Your information is no longer visible on ${r.sourceName}.`, link: `/app/removals/${r._id}`, pref: 'removalUpdates' });
      continue;
    }
    r.followUps += 1;
    if (r.followUps >= MAX_FOLLOW_UPS) {
      r.followUpAt = null;
      r.history.push({ status: r.status, note: 'No confirmation after several follow-ups. Consider escalating or closing the request.', actor: 'system' });
      await r.save();
      await notify(user, { type: 'follow_up', title: 'No response to your removal request', body: `${r.sourceName} has not confirmed removal. See suggested next steps.`, link: `/app/removals/${r._id}`, pref: 'removalUpdates' });
    } else {
      r.followUpAt = new Date(Date.now() + FOLLOW_UP_DAYS * 864e5);
      await r.save();
      await notify(user, { type: 'follow_up', title: 'Time to follow up', body: `It has been a while since your request to ${r.sourceName}. If they replied, add their response as evidence.`, link: `/app/removals/${r._id}`, pref: 'removalUpdates' });
    }
  }
  return handled;
}
