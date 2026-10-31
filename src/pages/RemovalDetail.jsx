import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { CONSENT_TEXT } from '../../shared/consents.js';
import { Alert, Button, Checkbox, ErrorAlert, Field, PageHeader, SkeletonRows, StatusBadge, useToast } from '../components/ui.jsx';
import { useResource } from '../hooks/useResource.js';
import { api } from '../services/api.js';
import { fmtDate, fmtDateTime, REQUEST_STATUS } from '../utils/format.js';

const FLOW = ['awaiting_consent', 'ready_to_submit', 'submitted', 'awaiting_response', 'closed'];
const CLOSED = ['removed', 'rejected', 'unable_to_remove', 'cancelled'];

function Steps({ status }) {
  const current = CLOSED.includes(status) ? 4 : status === 'submitting' ? 1 : FLOW.indexOf(status);
  const labels = ['Consent', 'Ready', 'Submitted', 'Awaiting reply', CLOSED.includes(status) ? REQUEST_STATUS[status].label : 'Outcome'];
  return (
    <ol className="steps" aria-label="Request progress">
      {labels.map((l, i) => (
        <li key={l} className={i < current ? 'done' : i === current ? 'active' : ''} aria-current={i === current ? 'step' : undefined}>{String(i + 1).padStart(2, '0')} {l}</li>
      ))}
    </ol>
  );
}

const NEXT_STEPS = {
  rejected: [
    'Reply asking for the specific legal reason and the name of their Grievance Officer.',
    'Intermediaries must acknowledge grievances within 24 hours and resolve them within 15 days under the IT Rules, 2021.',
    "If the grievance officer's decision is unsatisfactory, you can appeal to the Grievance Appellate Committee (gac.gov.in) within 30 days.",
    'For harassment or impersonation, you can also report at cybercrime.gov.in or call 1930.',
  ],
  unable_to_remove: [
    'Some data cannot be removed by request (breaches, government records, news reporting).',
    'Reduce impact instead: change exposed passwords, use a separate number or email for sign-ups, and register on the TRAI DND registry (call or SMS 1909).',
    'Keep this record. It helps if you escalate later.',
  ],
  noReply: [
    'Send a polite reminder quoting your reference number and submission date.',
    'If the site is an intermediary, escalate to its Grievance Officer, then the Grievance Appellate Committee if needed.',
  ],
};

export default function RemovalDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, setData } = useResource(`/removal-requests/${id}`);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ subject: '', body: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState(null);
  const [ref, setRef] = useState('');
  const [evidence, setEvidence] = useState({ kind: 'response', text: '', url: '' });
  const r = data?.removal;

  const act = async (name, fn, msg) => {
    setBusy(name);
    setActionError(null);
    try {
      const res = await fn();
      setData({ removal: res.removal });
      if (msg) toast(typeof msg === 'function' ? msg(res) : msg);
      return res;
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy('');
    }
  };

  if (loading) return <SkeletonRows rows={5} />;
  if (error) return <ErrorAlert error={error} title="Could not load this request" />;

  const approve = () =>
    act('approve', () => api.post(`/removal-requests/${id}/approve`, { confirm: true, ...(editing ? draft : {}) }), 'Approved. Review once more, then submit.').then(() => setEditing(false));
  const submit = () => act('submit', () => api.post(`/removal-requests/${id}/submit`), 'Request sent');
  const markSubmitted = (e) => {
    e.preventDefault();
    act('mark', () => api.post(`/removal-requests/${id}/mark-submitted`, { referenceId: ref || undefined }), 'Submission recorded');
  };
  const addEvidence = (e) => {
    e.preventDefault();
    act('evidence', () => api.post(`/removal-requests/${id}/evidence`, { kind: evidence.kind, text: evidence.text || undefined, url: evidence.url || undefined }), 'Evidence added').then(() => setEvidence({ kind: 'response', text: '', url: '' }));
  };
  const outcome = (o) => {
    if (!window.confirm(`Close this request as "${REQUEST_STATUS[o].label}"?`)) return;
    act('outcome', () => api.post(`/removal-requests/${id}/outcome`, { outcome: o }), 'Outcome recorded');
  };
  const recheck = () => act('recheck', () => api.post(`/removal-requests/${id}/recheck`), (res) => (res.result === 'absent' ? 'Confirmed removed' : res.result === 'present' ? 'Still visible on the source' : 'Could not check the page'));
  const cancel = () => window.confirm('Cancel this request? Nothing has been sent.') && act('cancel', () => api.post(`/removal-requests/${id}/cancel`), 'Request cancelled');

  const open = ['submitted', 'awaiting_response'].includes(r.status);

  return (
    <>
      <PageHeader
        crumb={{ to: '/app/removals', label: 'Removal requests' }}
        title={r.sourceName}
        description={<>Request created {fmtDate(r.createdAt)}{r.referenceId && <> · Ref <span className="mono">{r.referenceId}</span></>}</>}
        actions={<><StatusBadge kind="request" status={r.status} /></>}
      />
      <div style={{ marginBottom: 24 }}><Steps status={r.status} /></div>
      {r.lastError && r.status === 'ready_to_submit' && <div style={{ marginBottom: 16 }}><Alert tone="danger">{r.lastError}</Alert></div>}
      {actionError && <div style={{ marginBottom: 16 }}><ErrorAlert error={actionError} title="That did not work" /></div>}

      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h3>{r.status === 'awaiting_consent' ? 'Review the exact request' : 'Request'}</h3>
              {r.status === 'awaiting_consent' && !editing && (
                <Button variant="ghost" size="sm" onClick={() => { setDraft({ subject: r.subject, body: r.body }); setEditing(true); }}>Edit text</Button>
              )}
            </div>
            <div className="card-body stack">
              <dl className="kv">
                <dt>Channel</dt><dd className="mono small">{r.channel === 'web_form' ? 'Official web form' : r.channel}</dd>
                {r.recipientEmail && (<><dt>To</dt><dd className="mono small">{r.recipientEmail}</dd></>)}
                {r.formUrl && (<><dt>Form</dt><dd className="mono small"><a href={r.formUrl} target="_blank" rel="noopener noreferrer">{r.formUrl}</a></dd></>)}
                <dt>Subject</dt>
                <dd>{editing ? <input className="input" value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} aria-label="Subject" /> : r.subject}</dd>
              </dl>
              {editing ? (
                <Field label="Message">{(p) => <textarea {...p} className="textarea mono" rows={18} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />}</Field>
              ) : (
                <div className="pre">{r.body}</div>
              )}
              {r.instructions && <p className="small muted">{r.instructions}</p>}
            </div>
            {r.status === 'awaiting_consent' && (
              <div className="card-foot stack-sm" style={{ background: 'var(--bg)', padding: 20 }}>
                <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} label={CONSENT_TEXT.removal_submission} />
                <div className="row">
                  <Button onClick={approve} loading={busy === 'approve'} disabled={!agree}>Approve this request</Button>
                  {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Discard edits</Button>}
                  <Button variant="ghost" onClick={cancel} disabled={!!busy}>Cancel request</Button>
                </div>
              </div>
            )}
            {r.status === 'ready_to_submit' && (
              <div className="card-foot stack" style={{ background: 'var(--bg)', padding: 20 }}>
                {r.channel !== 'web_form' && (
                  <div className="row">
                    <Button onClick={submit} loading={busy === 'submit'}>Send to {r.recipientEmail}</Button>
                    <Button variant="ghost" onClick={cancel} disabled={!!busy}>Cancel</Button>
                  </div>
                )}
                <form onSubmit={markSubmitted} className="stack-sm">
                  <p className="small muted">
                    {r.channel === 'web_form' ? 'Open the official form, paste the request, submit it, then record it here.' : 'Prefer to send it yourself? Copy the text, send it, then record it here.'}
                  </p>
                  <div className="row" style={{ alignItems: 'flex-end' }}>
                    {r.formUrl && <a className="btn btn-secondary" href={r.formUrl} target="_blank" rel="noopener noreferrer">Open form</a>}
                    <Button type="button" variant="secondary" onClick={() => navigator.clipboard?.writeText(`${r.subject}\n\n${r.body}`).then(() => toast('Copied'))}>Copy text</Button>
                    <div className="grow" style={{ minWidth: 180 }}>
                      <Field label="Reference ID (optional)">{(p) => <input {...p} className="input" value={ref} onChange={(e) => setRef(e.target.value)} />}</Field>
                    </div>
                    <Button type="submit" variant="secondary" loading={busy === 'mark'}>I have submitted it</Button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {(open || CLOSED.includes(r.status)) && r.status !== 'cancelled' && (
            <section className="card">
              <div className="card-head"><h3>Evidence and replies</h3></div>
              <div className="card-body stack">
                {r.evidence.length ? (
                  <ul className="stack-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {r.evidence.map((e) => (
                      <li key={e.id} className="panel-muted small">
                        <div className="row-between"><span className="label">{e.kind}{e.actor === 'system' ? ' · automated' : ''}</span><span className="faint num">{fmtDateTime(e.at)}</span></div>
                        {e.text && <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{e.text}</p>}
                        {e.url && <a className="mono break" href={e.url} target="_blank" rel="noopener noreferrer nofollow">{e.url}</a>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">No replies recorded yet. Paste the website's response here when it arrives.</p>
                )}
                {open && (
                  <form onSubmit={addEvidence} className="stack-sm">
                    <div className="row" style={{ alignItems: 'flex-end' }}>
                      <Field label="Type">
                        {(p) => (
                          <select {...p} className="select" value={evidence.kind} onChange={(e) => setEvidence((v) => ({ ...v, kind: e.target.value }))} style={{ width: 180 }}>
                            <option value="response">Website reply</option>
                            <option value="link">Link (e.g. page now 404)</option>
                            <option value="note">Note</option>
                          </select>
                        )}
                      </Field>
                      <div className="grow" style={{ minWidth: 200 }}>
                        <Field label="Link (optional)">{(p) => <input {...p} className="input" type="url" value={evidence.url} onChange={(e) => setEvidence((v) => ({ ...v, url: e.target.value }))} />}</Field>
                      </div>
                    </div>
                    <Field label="Text">{(p) => <textarea {...p} className="textarea" rows={3} value={evidence.text} onChange={(e) => setEvidence((v) => ({ ...v, text: e.target.value }))} />}</Field>
                    <div><Button type="submit" variant="secondary" loading={busy === 'evidence'} disabled={!evidence.text && !evidence.url}>Add evidence</Button></div>
                  </form>
                )}
              </div>
            </section>
          )}

          {(r.status === 'rejected' || r.status === 'unable_to_remove' || (open && r.followUps >= 3)) && (
            <Alert tone="info" title="Suggested next steps">
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {(r.status === 'rejected' ? NEXT_STEPS.rejected : r.status === 'unable_to_remove' ? NEXT_STEPS.unable_to_remove : NEXT_STEPS.noReply).map((s) => <li key={s}>{s}</li>)}
              </ul>
            </Alert>
          )}
        </div>

        <aside className="stack">
          {open && (
            <section className="card card-pad stack">
              <span className="label">Outcome</span>
              <p className="small muted">Mark removed only once the website confirms or our re-check shows the information is gone.</p>
              {r.sourceKey === 'url_check' && <Button variant="secondary" onClick={recheck} loading={busy === 'recheck'}>Re-check the source now</Button>}
              <div className="stack-sm">
                <Button variant="secondary" block onClick={() => outcome('removed')} disabled={!!busy}>Mark removed</Button>
                <Button variant="ghost" block onClick={() => outcome('rejected')} disabled={!!busy}>Mark rejected</Button>
                <Button variant="ghost" block onClick={() => outcome('unable_to_remove')} disabled={!!busy}>Unable to remove</Button>
              </div>
              {r.followUpAt && <p className="small muted">Next follow-up: <span className="num">{fmtDate(r.followUpAt)}</span></p>}
            </section>
          )}
          <section className="card card-pad">
            <span className="label" style={{ display: 'block', marginBottom: 16 }}>Timeline</span>
            <ol className="timeline">
              {r.history.map((h, i) => (
                <li key={i} className={i === r.history.length - 1 ? 'current' : ''}>
                  <div className="small" style={{ fontWeight: 500 }}>{REQUEST_STATUS[h.status]?.label || h.status}</div>
                  {h.note && <div className="small muted">{h.note}</div>}
                  <div className="faint num" style={{ fontSize: 12 }}>{fmtDateTime(h.at)} · {h.actor}</div>
                </li>
              ))}
            </ol>
          </section>
          <Link className="small" to={`/app/findings/${r.finding}`}>View the finding</Link>
        </aside>
      </div>
    </>
  );
}
