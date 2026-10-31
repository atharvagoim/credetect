import { useState } from 'react';
import { Alert, Badge, Button, ErrorAlert, Field, PageHeader, Pagination, SkeletonRows, Stat, StatusBadge, Toggle, useToast } from '../components/ui.jsx';
import { useResource } from '../hooks/useResource.js';
import { api, qs } from '../services/api.js';
import { fmtDateTime, SOURCE_RUN_STATUS } from '../utils/format.js';

const TABS = ['Overview', 'Sources', 'Jobs', 'Alerts'];

function Overview() {
  const { data, error, loading } = useResource('/admin/overview');
  const health = useResource('/health');
  if (error) return <ErrorAlert error={error} />;
  const j = data?.jobs7d || {};
  const r = data?.removals || {};
  const integ = health.data?.integrations;
  return (
    <div className="stack-lg">
      <div className="stats">
        <Stat label="Users" value={data?.users} sub={data && `${data.verifiedUsers} verified`} loading={loading} />
        <Stat label="Monitoring on" value={data?.monitoringOn} loading={loading} />
        <Stat label="Scans · 7 days" value={data ? Object.values(j).reduce((a, b) => a + b, 0) : 0} sub={data && `${j.failed || 0} failed · ${j.partial || 0} partial`} loading={loading} />
        <Stat label="Findings" value={data?.findings.real} loading={loading} />
        <Stat label="Removed" value={r.removed || 0} sub={`${(r.awaiting_response || 0) + (r.submitted || 0)} awaiting reply`} loading={loading} />
        <Stat label="Open alerts" value={data?.openAlerts} loading={loading} />
      </div>
      {integ && (
        <section className="card">
          <div className="card-head"><h3>Integrations</h3></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Email</dt><dd>{integ.email === 'smtp' ? <Badge tone="ok">SMTP</Badge> : <Badge tone="danger">Off</Badge>}</dd>
              <dt>SMS</dt><dd>{integ.sms === 'twilio' ? <Badge tone="ok">Twilio</Badge> : integ.sms === 'textbee' ? <Badge tone="ok">TextBee</Badge> : <Badge>Email codes</Badge>}</dd>
              <dt>Billing</dt><dd>{integ.billing === 'razorpay' ? <Badge tone="ok">Razorpay</Badge> : <Badge>Not configured</Badge>}</dd>
              <dt>HIBP</dt><dd>{integ.hibp ? <Badge tone="ok">Configured</Badge> : <Badge>No API key</Badge>}</dd>
            </dl>
            {health.data?.missingConfig?.length > 0 && <div style={{ marginTop: 16 }}><Alert tone="danger">Missing: {health.data.missingConfig.join(', ')}</Alert></div>}
          </div>
        </section>
      )}
    </div>
  );
}

function SourceCard({ s, onSaved }) {
  const toast = useToast();
  const [cfg, setCfg] = useState({
    rateLimitPerMinute: s.config.rateLimitPerMinute ?? 30,
    timeoutMs: s.config.timeoutMs ?? 10000,
    contactEmail: s.config.removal?.contactEmail || '',
    formUrl: s.config.removal?.formUrl || '',
    instructions: s.config.removal?.instructions || '',
    subjectTemplate: s.config.removal?.subjectTemplate || '',
    bodyTemplate: s.config.removal?.bodyTemplate || '',
  });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const save = async (patch) => {
    setPending(true);
    setError(null);
    try {
      await api.patch(`/admin/sources/${s.key}`, patch);
      toast('Source updated');
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };
  const set = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.value }));
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="row"><h3>{s.name}</h3>{!s.available && <Badge tone="warn">{s.unavailableReason}</Badge>}</div>
          <p className="small muted mono">{s.key} · {s.kind} · {s.dataTypes.join(', ')}</p>
        </div>
      </div>
      <div className="card-body stack">
        <p className="small muted">{s.description}</p>
        <Toggle label="Enabled" checked={s.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        <div className="row small muted num">
          <span>runs {s.config.stats?.runs || 0}</span><span>errors {s.config.stats?.errors || 0}</span>
          {s.config.stats?.lastErrorAt && <span>last error {fmtDateTime(s.config.stats.lastErrorAt)}: {s.config.stats.lastError}</span>}
        </div>
        <details>
          <summary className="label" style={{ cursor: 'pointer' }}>Configuration and removal template</summary>
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="grid-2">
              <Field label="Rate limit / minute">{(p) => <input {...p} className="input" type="number" min={1} max={600} value={cfg.rateLimitPerMinute} onChange={set('rateLimitPerMinute')} />}</Field>
              <Field label="Timeout (ms)">{(p) => <input {...p} className="input" type="number" min={1000} max={30000} value={cfg.timeoutMs} onChange={set('timeoutMs')} />}</Field>
              <Field label="Default removal email">{(p) => <input {...p} className="input" type="email" value={cfg.contactEmail} onChange={set('contactEmail')} />}</Field>
              <Field label="Official removal form URL">{(p) => <input {...p} className="input" type="url" value={cfg.formUrl} onChange={set('formUrl')} />}</Field>
            </div>
            <Field label="Instructions shown to users">{(p) => <textarea {...p} className="textarea" rows={3} value={cfg.instructions} onChange={set('instructions')} />}</Field>
            <Field label="Subject template" hint="Placeholders: {{domain}} {{url}} {{dataTypeLabel}} {{valueLine}} {{fullName}} {{replyEmail}}">{(p) => <input {...p} className="input mono" value={cfg.subjectTemplate} onChange={set('subjectTemplate')} placeholder="Default template" />}</Field>
            <Field label="Body template" hint="Leave empty to use the built-in Indian template.">{(p) => <textarea {...p} className="textarea mono" rows={8} value={cfg.bodyTemplate} onChange={set('bodyTemplate')} />}</Field>
            <ErrorAlert error={error} title="Could not save" />
            <div>
              <Button
                variant="secondary"
                loading={pending}
                onClick={() =>
                  save({
                    rateLimitPerMinute: Number(cfg.rateLimitPerMinute),
                    timeoutMs: Number(cfg.timeoutMs),
                    removal: { contactEmail: cfg.contactEmail, formUrl: cfg.formUrl, instructions: cfg.instructions, subjectTemplate: cfg.subjectTemplate, bodyTemplate: cfg.bodyTemplate },
                  })
                }
              >
                Save configuration
              </Button>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

function Sources() {
  const { data, error, loading, reload } = useResource('/admin/sources');
  if (loading) return <SkeletonRows />;
  if (error) return <ErrorAlert error={error} />;
  return (
    <div className="stack">
      <Alert tone="info">Adapters are defined in code (server/adapters). Here you control whether each runs, its limits, and how removal requests are addressed. See docs/ADAPTERS.md to add a source.</Alert>
      {data.sources.map((s) => <SourceCard key={s.key} s={s} onSaved={() => reload(true)} />)}
    </div>
  );
}

function Jobs() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useResource(`/admin/jobs${qs({ status, page, limit: 25 })}`);
  return (
    <div className="stack">
      <div className="filters">
        <select className="select" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['queued', 'running', 'completed', 'partial', 'failed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <ErrorAlert error={error} />
      {loading && !data ? <SkeletonRows /> : (
        <>
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Created</th><th>User ref</th><th>Status</th><th>Trigger</th><th>Sources</th></tr></thead>
              <tbody>
                {data?.items.map((j) => (
                  <tr key={j.id}>
                    <td className="td-primary td-mono" data-label="Created">{fmtDateTime(j.createdAt)}</td>
                    <td data-label="User" className="td-mono">{j.userRef}</td>
                    <td data-label="Status"><StatusBadge kind="job" status={j.status} /> <span className="small faint">×{j.attempts}</span></td>
                    <td data-label="Trigger" className="td-mono">{j.trigger}</td>
                    <td data-label="Sources" className="small">{j.sources.map((s) => <div key={s.key}><span className="mono">{s.key}</span> {SOURCE_RUN_STATUS[s.status]}{s.durationMs != null ? ` · ${s.durationMs}ms` : ''}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && <Pagination page={page} limit={25} total={data.total} onPage={setPage} />}
        </>
      )}
    </div>
  );
}

function Alerts() {
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState('true');
  const { data, error, loading, reload } = useResource(`/admin/events${qs({ kind, open, limit: 50 })}`);
  const ack = async (id) => {
    await api.post(`/admin/events/${id}/ack`);
    reload(true);
  };
  return (
    <div className="stack">
      <div className="filters">
        <select className="select" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          {['adapter_error', 'job_failed', 'rate_limit', 'abuse', 'email_error', 'billing', 'config'].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select className="select" aria-label="State" value={open} onChange={(e) => setOpen(e.target.value)}>
          <option value="true">Open</option>
          <option value="">All</option>
        </select>
      </div>
      <ErrorAlert error={error} />
      {loading && !data ? <SkeletonRows /> : data?.items.length ? (
        <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.items.map((e, i) => (
            <li key={e.id} className="row-between" style={{ padding: '14px 20px', borderTop: i ? '1px solid var(--border)' : 0 }}>
              <div className="grow">
                <div className="row"><Badge tone={e.level === 'error' ? 'danger' : e.level === 'warn' ? 'warn' : ''}>{e.kind}</Badge><span className="mono small">{e.source}</span></div>
                <p className="small" style={{ marginTop: 4 }}>{e.message}</p>
                <p className="faint num" style={{ fontSize: 12 }}>{fmtDateTime(e.createdAt)}{e.meta?.subjectRef ? ` · subject ${e.meta.subjectRef}` : ''}</p>
              </div>
              {!e.acknowledgedAt && <Button variant="ghost" size="sm" onClick={() => ack(e.id)}>Acknowledge</Button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No events.</p>
      )}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('Overview');
  return (
    <>
      <PageHeader title="Admin" description="Aggregate operations data. Personal details are never shown here; users appear as pseudonymous references." />
      <div className="segmented" role="tablist" style={{ marginBottom: 24 }}>
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Overview' && <Overview />}
      {tab === 'Sources' && <Sources />}
      {tab === 'Jobs' && <Jobs />}
      {tab === 'Alerts' && <Alerts />}
    </>
  );
}
