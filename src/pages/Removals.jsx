import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge, EmptyState, ErrorAlert, PageHeader, Pagination, SkeletonRows, StatusBadge } from '../components/ui.jsx';
import { useResource } from '../hooks/useResource.js';
import { qs } from '../services/api.js';
import { fmtDate } from '../utils/format.js';

const CHANNEL = { email: 'Email', web_form: 'Web form', none: '—' };

export default function Removals() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useResource(`/removal-requests${qs({ status, page, limit: 20 })}`);

  return (
    <>
      <PageHeader title="Removal requests" description="Every request you have drafted, approved and sent, with its current state." />
      <div className="filters" style={{ marginBottom: 16 }}>
        <label>
          <span className="sr-only">Status</span>
          <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All requests</option>
            <option value="awaiting_consent">Awaiting consent</option>
            <option value="ready_to_submit">Ready to submit</option>
            <option value="awaiting_response">Awaiting response</option>
            <option value="removed">Removed</option>
            <option value="rejected">Rejected</option>
            <option value="unable_to_remove">Unable to remove</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      <ErrorAlert error={error} />
      {loading && !data ? (
        <SkeletonRows />
      ) : data?.items.length ? (
        <>
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Source</th><th>Status</th><th>Channel</th><th>Submitted</th><th>Next follow-up</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => navigate(`/app/removals/${r.id}`)}>
                    <td className="td-primary" data-label="Source">
                      <Link to={`/app/removals/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 500, textDecoration: 'none' }}>{r.sourceName}</Link>
                    </td>
                    <td data-label="Status"><StatusBadge kind="request" status={r.status} /></td>
                    <td data-label="Channel" className="td-mono">{CHANNEL[r.channel]}</td>
                    <td data-label="Submitted" className="td-mono">{fmtDate(r.submittedAt)}</td>
                    <td data-label="Follow-up" className="td-mono">{r.followUpAt ? fmtDate(r.followUpAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={20} total={data.total} onPage={setPage} />
        </>
      ) : (
        <EmptyState icon="removals" title="No removal requests yet" action={<Link to="/app/findings" className="btn">Review findings</Link>}>
          Open a finding and choose Request removal. You will review the exact request before anything is sent.
        </EmptyState>
      )}
    </>
  );
}
