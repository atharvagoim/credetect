import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Button, Confidence, ErrorAlert, Field, Modal, PageHeader, SkeletonRows, StatusBadge, useToast } from '../components/ui.jsx';
import { useResource } from '../hooks/useResource.js';
import { api } from '../services/api.js';
import { DATA_TYPE_LABEL, fmtDateTime } from '../utils/format.js';

const BREACH_STEPS = [
  'Change the password for this service, and anywhere you reused it.',
  'Turn on two-factor authentication where available.',
  'Be wary of emails, SMS or calls that mention this service or your details. They may be phishing.',
  'If financial data was exposed, watch your statements and contact your bank.',
];

function RequestModal({ finding, open, onClose }) {
  const navigate = useNavigate();
  const [recipientEmail, setRecipient] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const create = async () => {
    setPending(true);
    setError(null);
    try {
      const { removal } = await api.post('/removal-requests', { findingId: finding.id, recipientEmail, formUrl });
      navigate(`/app/removals/${removal.id}`);
    } catch (e) {
      if (e.code === 'CONFLICT' && e.details?.removalId) return navigate(`/app/removals/${e.details.removalId}`);
      setError(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Draft a removal request"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={create} loading={pending}>Generate draft</Button></>}
    >
      <div className="stack">
        <p className="small muted">We will generate a request for you to review. Nothing is sent until you approve the exact text.</p>
          <Field label="Grievance or privacy email of the website" hint="Usually in the site's footer, privacy policy or terms. Indian intermediaries must publish a grievance officer.">
            {(p) => <input {...p} className="input" type="email" value={recipientEmail} onChange={(e) => setRecipient(e.target.value)} placeholder="grievance@example.com" />}
          </Field>
          <Field label="Or the official removal form URL" hint="If the site only accepts requests through a form, you will submit it there and record the reference here.">
            {(p) => <input {...p} className="input" type="url" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://" />}
          </Field>
        <ErrorAlert error={error} title="Could not create request" />
      </div>
    </Modal>
  );
}

export default function FindingDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, setData } = useResource(`/findings/${id}`);
  const [open, setOpen] = useState(false);
  const f = data?.finding;

  const setStatus = async (status) => {
    try {
      const res = await api.patch(`/findings/${id}`, { status });
      setData(res);
      toast(status === 'dismissed' ? 'Finding dismissed' : 'Finding updated');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (loading) return <SkeletonRows rows={4} />;
  if (error) return <ErrorAlert error={error} title="Could not load this finding" />;

  const canRequest = f.removable && ['none', 'rejected', 'unable_to_remove'].includes(f.removalStatus) && f.status !== 'dismissed';

  return (
    <>
      <PageHeader
        crumb={{ to: '/app/findings', label: 'Findings' }}
        title={f.sourceName}
        description={<span className="mono break">{f.domain}</span>}
        actions={
          <>
            {f.status !== 'confirmed' && f.status !== 'dismissed' && <Button variant="secondary" onClick={() => setStatus('confirmed')}>This is me</Button>}
            {f.status !== 'dismissed' ? <Button variant="ghost" onClick={() => setStatus('dismissed')}>Not me / dismiss</Button> : <Button variant="secondary" onClick={() => setStatus('reviewed')}>Restore</Button>}
            {canRequest && <Button onClick={() => setOpen(true)}>Request removal</Button>}
            {f.removalStatus === 'in_progress' && <Link className="btn" to="/app/removals">View request</Link>}
          </>
        }
      />
      <div className="split">
        <section className="card">
          <div className="card-head"><h3>Evidence</h3></div>
          <div className="card-body stack">
            <p>{f.evidenceSummary}</p>
            <dl className="kv">
              <dt>Source URL</dt>
              <dd className="mono small"><a href={f.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{f.sourceUrl}</a></dd>
              <dt>Data exposed</dt><dd>{DATA_TYPE_LABEL[f.dataType]} · <span className="num">{f.matchedValueMasked}</span></dd>
              <dt>Confidence</dt><dd><Confidence value={f.confidence} /></dd>
              <dt>Category</dt><dd className="mono small">{f.category}</dd>
              <dt>First seen</dt><dd className="num small">{fmtDateTime(f.firstSeenAt)}</dd>
              <dt>Last seen</dt><dd className="num small">{fmtDateTime(f.lastSeenAt)}</dd>
            </dl>
          </div>
        </section>
        <aside className="stack">
          <section className="card card-pad stack-sm">
            <span className="label">Review</span>
            <StatusBadge kind="finding" status={f.status} />
            <p className="small muted">Confirm findings that are really you. Dismiss those that are someone else, especially name-only matches.</p>
          </section>
          <section className="card card-pad stack-sm">
            <span className="label">Removal</span>
            {f.removable ? <StatusBadge kind="removal" status={f.removalStatus} /> : <span className="small">Not removable by request</span>}
            {!f.removable && f.category === 'breach' && (
              <>
                <p className="small muted">Breached data is held by third parties and cannot be deleted. Protect yourself instead:</p>
                <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>{BREACH_STEPS.map((s) => <li key={s} style={{ marginBottom: 4 }}>{s}</li>)}</ol>
              </>
            )}
          </section>
        </aside>
      </div>
      {open && <RequestModal finding={f} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
