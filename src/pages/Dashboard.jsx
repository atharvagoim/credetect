import { Link } from 'react-router';
import { Alert, Button, EmptyState, ErrorAlert, PageHeader, Skeleton, Stat, StatusBadge } from '../components/ui.jsx';
import { useResource } from '../hooks/useResource.js';
import { fmtDate, fmtDateTime, timeAgo } from '../utils/format.js';

export default function Dashboard() {
  const { data, error, loading } = useResource('/dashboard');
  const d = data;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Where your verified details appear on supported sources, and what is being done about it."
        actions={<Link to="/app/scans?start=1" className="btn">Run a scan</Link>}
      />
      <ErrorAlert error={error} title="Could not load your dashboard" />

      <div className="stats" style={{ marginBottom: 32 }}>
        <Stat label="Total findings" value={d?.findings.total ?? 0} loading={loading} />
        <Stat label="New" value={d?.findings.new ?? 0} sub="Awaiting your review" loading={loading} />
        <Stat label="Requests in progress" value={d?.removals.inProgress ?? 0} loading={loading} />
        <Stat label="Confirmed removals" value={d?.removals.removed ?? 0} loading={loading} />
        <Stat label="Rejected / failed" value={d?.removals.failed ?? 0} loading={loading} />
        <Stat label="Last scan" value={<span style={{ fontSize: 18 }}>{d?.lastScan ? fmtDate(d.lastScan.finishedAt) : 'Never'}</span>} sub={d?.lastScan ? timeAgo(d.lastScan.finishedAt) : null} loading={loading} />
      </div>

      {!loading && d && !d.lastScan && !d.activeScan && (
        <EmptyState icon="scans" title="Run your first scan" action={<Link to="/app/scans?start=1" className="btn">Scan My Digital Footprint</Link>}>
          We will check supported sources for your verified contact details. It usually takes under a minute.
        </EmptyState>
      )}

      {d && (d.lastScan || d.activeScan) && (
        <div className="split">
          <section className="card" aria-labelledby="act-h">
            <div className="card-head"><h3 id="act-h">Recent activity</h3></div>
            {d.activity.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {d.activity.map((a, i) => (
                  <li key={a.id} className="row-between" style={{ padding: '12px 20px', borderTop: i ? '1px solid var(--border)' : 0 }}>
                    <span>{a.label}{a.meta ? <span className="muted"> · {String(a.meta).replace(/_/g, ' ')}</span> : null}</span>
                    <span className="small muted num">{fmtDateTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="card-body muted">No activity yet.</div>
            )}
          </section>

          <aside className="stack">
            <section className="card card-pad stack-sm">
              <span className="label">Scan status</span>
              {d.activeScan ? (
                <div className="row"><StatusBadge kind="job" status={d.activeScan.status} /> <span className="small muted">started {timeAgo(d.activeScan.createdAt)}</span></div>
              ) : d.lastScan ? (
                <>
                  <div className="row"><StatusBadge kind="job" status={d.lastScan.status} /><span className="small muted">{timeAgo(d.lastScan.finishedAt)}</span></div>
                  <p className="small muted">{d.lastScan.totalFindings} matches, {d.lastScan.newFindings} new.</p>
                </>
              ) : (
                <Skeleton h={20} />
              )}
              <Link to="/app/scans" className="small">View scan history</Link>
            </section>
            <section className="card card-pad stack-sm">
              <span className="label">Monitoring</span>
              {d.monitoring.enabled ? (
                <p className="small">On · {d.monitoring.frequency}. Next scan {fmtDate(d.monitoring.nextRunAt)}.</p>
              ) : (
                <p className="small muted">Off. Turn it on to be alerted when new listings appear.</p>
              )}
              <Link to="/app/monitoring" className="small">Manage monitoring</Link>
            </section>
            {d.findings.new > 0 && (
              <section className="card card-pad stack-sm">
                <span className="label">Next step</span>
                <p className="small">Review {d.findings.new} new finding{d.findings.new === 1 ? '' : 's'} and decide what to request removal for.</p>
                <Button as={Link} to="/app/findings?status=new" size="sm">Review findings</Button>
              </section>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
