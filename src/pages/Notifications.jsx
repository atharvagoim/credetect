import { useState } from 'react';
import { Link } from 'react-router';
import { Button, EmptyState, ErrorAlert, PageHeader, Pagination, SkeletonRows } from '../components/ui.jsx';
import { useResource } from '../hooks/useResource.js';
import { api } from '../services/api.js';
import { fmtDateTime } from '../utils/format.js';

export default function Notifications() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource(`/notifications?page=${page}&limit=20`);

  const readAll = async () => {
    await api.post('/notifications/read-all');
    reload(true);
  };
  const markRead = (n) => !n.readAt && api.post(`/notifications/${n.id}/read`).catch(() => {});

  return (
    <>
      <PageHeader title="Notifications" actions={data?.unreadCount > 0 && <Button variant="secondary" size="sm" onClick={readAll}>Mark all read</Button>} />
      <ErrorAlert error={error} />
      {loading && !data ? (
        <SkeletonRows />
      ) : data?.items.length ? (
        <>
          <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {data.items.map((n, i) => (
              <li key={n.id} style={{ padding: '16px 20px', borderTop: i ? '1px solid var(--border)' : 0, background: n.readAt ? 'var(--bg)' : 'var(--surface)' }}>
                <div className="row-between">
                  <div className="row">
                    {!n.readAt && <span aria-label="Unread" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ink)', display: 'inline-block' }} />}
                    <strong>{n.title}</strong>
                  </div>
                  <span className="small muted num">{fmtDateTime(n.createdAt)}</span>
                </div>
                {n.body && <p className="small muted" style={{ marginTop: 4 }}>{n.body}</p>}
                {n.link && <Link className="small" to={n.link} onClick={() => markRead(n)} style={{ display: 'inline-block', marginTop: 6 }}>Open</Link>}
              </li>
            ))}
          </ul>
          <Pagination page={page} limit={20} total={data.total} onPage={setPage} />
        </>
      ) : (
        <EmptyState icon="inbox" title="No notifications">Scan results, follow-up reminders and removal confirmations will appear here.</EmptyState>
      )}
    </>
  );
}
