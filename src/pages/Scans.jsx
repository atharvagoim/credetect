import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert, Badge, Button, EmptyState, ErrorAlert, Field, Pagination, PageHeader, SkeletonRows, StatusBadge } from '../components/ui.jsx';
import { useResource } from '../hooks/useResource.js';
import { api } from '../services/api.js';
import { fmtDateTime, SOURCE_RUN_STATUS } from '../utils/format.js';

function ScanForm({ sources, onDone, autoStart }) {
  const [urls, setUrls] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const started = useRef(false);
  const usable = sources.filter((s) => s.usable && !s.requiresUrls);
  const pageCheck = sources.find((s) => s.key === 'url_check');

  const run = async (withUrls) => {
    setPending(true);
    setError(null);
    try {
      const list = withUrls ? urls.split(/\s+/).map((u) => u.trim()).filter(Boolean) : [];
      const body = withUrls ? { sources: ['url_check'], urls: list } : {};
      const { job } = await api.post('/scans', body);
      setUrls('');
      onDone(job);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (autoStart && !started.current && usable.length) {
      started.current = true;
      run(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, usable.length]);

  return (
    <div className="grid-2" style={{ marginBottom: 32 }}>
      <section className="card">
        <div className="card-head"><h3>Scan supported sources</h3></div>
        <div className="card-body stack">
          {usable.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack-sm">
              {usable.map((s) => (
                <li key={s.key} className="row">
                  <span className="mono small">{s.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Alert tone="warn">No automatic sources are enabled right now. You can still check specific pages.</Alert>
          )}
          {sources.filter((s) => !s.usable && !s.requiresUrls).map((s) => (
            <p key={s.key} className="small faint">{s.name}: {s.unavailableReason || 'disabled'}</p>
          ))}
          <Button onClick={() => run(false)} loading={pending} disabled={!usable.length}>{pending ? 'Scanning…' : 'Start scan'}</Button>
        </div>
      </section>
      {pageCheck?.usable && (
        <section className="card">
          <div className="card-head"><h3>Check specific pages</h3></div>
          <div className="card-body stack">
            <p className="small muted">Found your details on a website? Paste up to 3 public page URLs. We fetch only those pages, respect robots.txt, and never log in.</p>
            <Field label="Page URLs" hint="One per line, starting with https://">
              {(p) => <textarea {...p} className="textarea mono" rows={3} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://example.com/listing/123" />}
            </Field>
            <Button variant="secondary" onClick={() => run(true)} loading={pending} disabled={!urls.trim()}>Check pages</Button>
          </div>
        </section>
      )}
      {error && <div style={{ gridColumn: '1 / -1' }}><ErrorAlert error={error} title="Scan could not start" />{error.code === 'PLAN_LIMIT' && <p className="small" style={{ marginTop: 8 }}><Link to="/app/plans">See plans</Link></p>}</div>}
    </div>
  );
}

export default function Scans() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const sources = useResource('/sources');
  const scans = useResource(`/scans?page=${page}&limit=10`);
  const [last, setLast] = useState(null);
  const autoStart = params.get('start') === '1';

  const onDone = (job) => {
    setLast(job);
    if (autoStart) setParams({}, { replace: true });
    scans.reload(true);
  };

  return (
    <>
      <PageHeader title="Scans" description="Scans check only the sources listed here. Coverage grows as we add sources that permit lookups." />
      {sources.loading ? <SkeletonRows rows={2} /> : sources.data && <ScanForm sources={sources.data.sources} onDone={onDone} autoStart={autoStart} />}
      <ErrorAlert error={sources.error} />

      {last && (
        <div style={{ marginBottom: 24 }}>
          <Alert
            tone={last.status === 'completed' ? 'ok' : last.status === 'failed' ? 'danger' : 'warn'}
            title={last.status === 'completed' ? 'Scan complete' : last.status === 'queued' ? 'Some sources will be retried' : `Scan ${last.status}`}
            action={last.totalFindings > 0 ? <Button size="sm" onClick={() => navigate('/app/findings?status=new')}>Review findings</Button> : null}
          >
            {last.totalFindings} match{last.totalFindings === 1 ? '' : 'es'} found, {last.newFindings} new.
            {last.status === 'queued' && ' Sources that were busy or timed out are queued and will be retried automatically.'}
          </Alert>
        </div>
      )}

      <h3 style={{ marginBottom: 12 }}>History</h3>
      {scans.loading && !scans.data ? (
        <SkeletonRows />
      ) : scans.data?.items.length ? (
        <>
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Started</th><th>Status</th><th>Trigger</th><th>Sources</th><th>Matches</th></tr></thead>
              <tbody>
                {scans.data.items.map((j) => (
                  <tr key={j.id}>
                    <td className="td-primary td-mono" data-label="Started">{fmtDateTime(j.createdAt)}</td>
                    <td data-label="Status"><StatusBadge kind="job" status={j.status} /></td>
                    <td data-label="Trigger" className="td-mono">{j.trigger}{j.urlCount ? ` · ${j.urlCount} url` : ''}</td>
                    <td data-label="Sources">
                      <div className="stack-sm">
                        {j.sources.map((s) => (
                          <div key={s.key} className="small">
                            <span className="mono">{s.key}</span> <span className="muted">· {SOURCE_RUN_STATUS[s.status]}{s.status === 'ok' ? ` (${s.findings})` : ''}</span>
                            {s.message && <div className="faint" style={{ fontSize: 12 }}>{s.message}</div>}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td data-label="Matches" className="num">
                      {j.totalFindings ? <Link to={`/app/findings?scan=${j.id}`}>{j.totalFindings} ({j.newFindings} new)</Link> : j.totalFindings}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={10} total={scans.data.total} onPage={setPage} />
        </>
      ) : (
        <EmptyState icon="scans" title="No scans yet">Start a scan above to check supported sources for your verified details.</EmptyState>
      )}
    </>
  );
}
