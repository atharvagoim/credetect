import { useState } from 'react';
import { Link } from 'react-router';
import { CONSENT_TEXT, CONSENT_VERSION } from '../../shared/consents.js';
import { Alert, Button, Checkbox, ErrorAlert, PageHeader, SkeletonRows, Toggle, useToast } from '../components/ui.jsx';
import { useResource } from '../hooks/useResource.js';
import { api } from '../services/api.js';
import { fmtDate } from '../utils/format.js';

export default function Monitoring() {
  const toast = useToast();
  const profile = useResource('/profile');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  if (profile.loading) return <SkeletonRows rows={3} />;
  if (profile.error) return <ErrorAlert error={profile.error} />;
  const p = profile.data;
  const m = p.monitoring;
  const hasConsent = p.consents.includes('monitoring');
  const isPaid = p.user.plan.tier === 'monitor' || p.user.role === 'admin';

  const update = async (body) => {
    setPending(true);
    setError(null);
    try {
      if (body.enabled && !hasConsent) await api.post('/consents', { scopes: ['monitoring'], version: CONSENT_VERSION });
      await api.patch('/monitoring', body);
      await profile.reload(true);
      toast(body.enabled ? 'Monitoring updated' : 'Monitoring turned off');
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader title="Monitoring" description="Re-scan supported sources on a schedule and get alerted when your details appear somewhere new." />
      <div className="split">
        <section className="card">
          <div className="card-body stack">
            <Toggle
              label="Scheduled scans"
              description={m.enabled ? `On · next scan ${fmtDate(m.nextRunAt)}` : 'Off'}
              checked={m.enabled}
              disabled={pending || (!m.enabled && !hasConsent && !consent)}
              onChange={(e) => update({ enabled: e.target.checked, frequency: m.frequency })}
            />
            {!hasConsent && !m.enabled && (
              <div className="panel-muted">
                <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} label={CONSENT_TEXT.monitoring} />
              </div>
            )}
            <hr className="divider" style={{ margin: '8px 0' }} />
            <div className="stack-sm">
              <span className="field-label">Frequency</span>
              <div className="segmented" role="group" aria-label="Frequency">
                {['monthly', 'weekly'].map((f) => (
                  <button key={f} type="button" aria-pressed={m.frequency === f} disabled={pending || (f === 'weekly' && !isPaid)} onClick={() => update({ enabled: m.enabled, frequency: f })}>
                    {f}
                  </button>
                ))}
              </div>
              {!isPaid && <p className="small muted">Weekly scans are part of the <Link to="/app/plans">Monitor plan</Link>.</p>}
            </div>
            <ErrorAlert error={error} title="Could not update monitoring" />
          </div>
        </section>
        <aside className="stack">
          <section className="card card-pad stack-sm">
            <span className="label">Last scheduled scan</span>
            <p className="num">{m.lastRunAt ? fmtDate(m.lastRunAt) : 'Not yet'}</p>
          </section>
          <Alert tone="info" title="How it works">
            A background job runs daily, starts any scans that are due, retries sources that were temporarily unavailable, and re-checks removal requests that are awaiting a reply. Alerts follow your notification settings.
          </Alert>
          <Link to="/app/settings#notifications" className="small">Notification preferences</Link>
        </aside>
      </div>
    </>
  );
}
