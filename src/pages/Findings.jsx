import { Link, useNavigate, useSearchParams } from 'react-router';
import { Confidence, EmptyState, ErrorAlert, PageHeader, Pagination, SkeletonRows, StatusBadge } from '../components/ui.jsx';
import { useResource } from '../hooks/useResource.js';
import { qs } from '../services/api.js';
import { DATA_TYPE_LABEL, fmtDate } from '../utils/format.js';

const FILTERS = [
  ['status', 'Status', [['', 'All active'], ['new', 'New'], ['reviewed', 'Reviewed'], ['confirmed', 'Confirmed mine'], ['dismissed', 'Dismissed']]],
  ['removalStatus', 'Removal', [['', 'Any removal state'], ['none', 'No request'], ['in_progress', 'In progress'], ['removed', 'Removed'], ['rejected', 'Rejected'], ['unable_to_remove', 'Unable to remove']]],
  ['dataType', 'Data type', [['', 'All data types'], ['phone', 'Phone'], ['email', 'Email'], ['name', 'Name']]],
];

export default function Findings() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const page = Number(params.get('page') || 1);
  const query = Object.fromEntries(['status', 'removalStatus', 'dataType', 'sourceKey', 'scan'].map((k) => [k, params.get(k) || '']));
  const { data, error, loading } = useResource(`/findings${qs({ ...query, page, limit: 20 })}`);

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const hasFilters = Object.values(query).some(Boolean);

  return (
    <>
      <PageHeader title="Findings" description="Places on supported sources where your verified details appear. Values are masked; open a finding to see its evidence." />

      <div className="filters" role="group" aria-label="Filter findings" style={{ marginBottom: 16 }}>
        {FILTERS.map(([key, label, opts]) => (
          <label key={key}>
            <span className="sr-only">{label}</span>
            <select className="select" value={query[key]} onChange={(e) => set(key, e.target.value)}>
              {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
        {data?.facets?.sources?.length > 1 && (
          <label>
            <span className="sr-only">Source</span>
            <select className="select" value={query.sourceKey} onChange={(e) => set('sourceKey', e.target.value)}>
              <option value="">All sources</option>
              {data.facets.sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {hasFilters && <button className="btn btn-ghost btn-sm" onClick={() => setParams({})}>Clear filters</button>}
      </div>

      <ErrorAlert error={error} title="Could not load findings" />
      {loading && !data ? (
        <SkeletonRows rows={5} />
      ) : data?.items.length ? (
        <>
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr><th>Source</th><th>Data</th><th>Confidence</th><th>Found</th><th>Status</th><th>Removal</th></tr>
              </thead>
              <tbody>
                {data.items.map((f) => (
                  <tr key={f.id} className="clickable" onClick={() => navigate(`/app/findings/${f.id}`)}>
                    <td className="td-primary" data-label="Source">
                      <Link to={`/app/findings/${f.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 500, textDecoration: 'none' }}>{f.sourceName}</Link>
                      <div className="small muted mono break">{f.domain}</div>
                    </td>
                    <td data-label="Data"><span className="label" style={{ color: 'var(--fg-2)' }}>{DATA_TYPE_LABEL[f.dataType]}</span><div className="small num muted">{f.matchedValueMasked}</div></td>
                    <td data-label="Confidence"><Confidence value={f.confidence} /></td>
                    <td data-label="Found" className="td-mono">{fmtDate(f.firstSeenAt)}</td>
                    <td data-label="Status"><StatusBadge kind="finding" status={f.status} /></td>
                    <td data-label="Removal">{f.removable ? <StatusBadge kind="removal" status={f.removalStatus} /> : <span className="small muted">Not removable</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={20} total={data.total} onPage={(p) => set('page', String(p))} />
        </>
      ) : hasFilters ? (
        <EmptyState icon="findings" title="No findings match these filters" action={<button className="btn btn-secondary" onClick={() => setParams({})}>Clear filters</button>} />
      ) : (
        <EmptyState icon="shield" title="Nothing found yet" action={<Link className="btn" to="/app/scans?start=1">Run a scan</Link>}>
          Either you have not scanned yet, or supported sources did not show your verified details. That is good news, within the limits of our coverage.
        </EmptyState>
      )}
    </>
  );
}
