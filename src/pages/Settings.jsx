import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CONSENT_TEXT, CONSENT_VERSION } from '../../shared/consents.js';
import ContactManager from '../components/ContactManager.jsx';
import { Alert, Badge, Button, Checkbox, ErrorAlert, Field, Modal, PageHeader, SkeletonRows, Toggle, useToast } from '../components/ui.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { useResource } from '../hooks/useResource.js';
import { api } from '../services/api.js';
import { fmtDate } from '../utils/format.js';

function Section({ id, title, description, children }) {
  return (
    <section id={id} className="card" style={{ scrollMarginTop: 80 }}>
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {description && <p className="small muted" style={{ marginTop: 2 }}>{description}</p>}
        </div>
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

function ProfileForm({ profile, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(profile.fullName);
  const [types, setTypes] = useState(profile.scanDataTypes);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const toggle = (t) => setTypes((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]));
  const save = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.patch('/profile', { fullName: name, scanDataTypes: types });
      toast('Profile saved');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };
  return (
    <form onSubmit={save} className="stack">
      <Field label="Full name">{(p) => <input {...p} className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 420 }} />}</Field>
      <div className="stack-sm">
        <span className="field-label">Scan for</span>
        <div className="row" style={{ gap: 20 }}>
          {['phone', 'email', 'name'].map((t) => <Checkbox key={t} checked={types.includes(t)} onChange={() => toggle(t)} label={t[0].toUpperCase() + t.slice(1)} />)}
        </div>
      </div>
      <ErrorAlert error={error} title="Could not save" />
      <div><Button type="submit" variant="secondary" loading={pending}>Save profile</Button></div>
    </form>
  );
}

function NotificationPrefs({ prefs, onSaved }) {
  const [p, setP] = useState(prefs);
  useEffect(() => setP(prefs), [prefs]);
  const set = async (key, value) => {
    const next = { ...p, [key]: value };
    setP(next);
    await api.patch('/profile', { notificationPrefs: { [key]: value } });
    onSaved();
  };
  return (
    <div className="stack">
      <Toggle label="Email notifications" description="Master switch for all emails except security and account messages." checked={p.email} onChange={(e) => set('email', e.target.checked)} />
      <Toggle label="New findings" checked={p.newFindings} disabled={!p.email} onChange={(e) => set('newFindings', e.target.checked)} />
      <Toggle label="Removal updates and follow-ups" checked={p.removalUpdates} disabled={!p.email} onChange={(e) => set('removalUpdates', e.target.checked)} />
      <Toggle label="Product updates" checked={p.productUpdates} disabled={!p.email} onChange={(e) => set('productUpdates', e.target.checked)} />
    </div>
  );
}

const SCOPE_LABEL = { data_processing: 'Data processing', scanning: 'Scanning', monitoring: 'Monitoring' };

function Consents({ active, onChange }) {
  const toast = useToast();
  const revoke = async (scope) => {
    const msg = scope === 'data_processing' ? 'Withdrawing this stops all scanning and monitoring. Your data stays until you delete your account.' : `Withdraw ${SCOPE_LABEL[scope].toLowerCase()} consent?`;
    if (!window.confirm(msg)) return;
    await api.del(`/consents/${scope}`);
    toast('Consent withdrawn');
    onChange();
  };
  const grant = async (scope) => {
    await api.post('/consents', { scopes: scope === 'scanning' && !active.includes('data_processing') ? ['data_processing', 'scanning'] : [scope], version: CONSENT_VERSION });
    toast('Consent given');
    onChange();
  };
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="stack">
      {Object.keys(SCOPE_LABEL).map((s) => (
        <li key={s} className="stack-sm">
          <div className="row-between">
            <div className="row"><strong>{SCOPE_LABEL[s]}</strong>{active.includes(s) ? <Badge tone="ok" dot>Given</Badge> : <Badge>Not given</Badge>}</div>
            {active.includes(s) ? <Button variant="ghost" size="sm" onClick={() => revoke(s)}>Withdraw</Button> : <Button variant="secondary" size="sm" onClick={() => grant(s)}>Give consent</Button>}
          </div>
          <p className="small muted">{CONSENT_TEXT[s]}</p>
        </li>
      ))}
      <li className="small faint mono">Version {CONSENT_VERSION}. Each change is recorded in your audit trail.</li>
    </ul>
  );
}

function DeleteAccount() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const del = async () => {
    setPending(true);
    setError(null);
    try {
      await api.del('/profile', { password, confirm });
      setUser(null);
      navigate('/');
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>Delete account</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Keep account</Button><Button variant="danger" onClick={del} loading={pending} disabled={confirm !== 'DELETE' || !password}>Delete permanently</Button></>}
      >
        <div className="stack">
          <p>This permanently deletes your contacts, findings, removal requests, notifications and consent records.</p>
          <ul className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Requests already sent to websites cannot be recalled.</li>
            <li>Payment records are kept without your identity where tax law requires.</li>
            <li>A pseudonymous audit trail (no contact details) is kept for up to 12 months, then deleted.</li>
          </ul>
          <Field label="Password">{(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Field label="Type DELETE to confirm">{(p) => <input {...p} className="input mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
          <ErrorAlert error={error} title="Could not delete account" />
        </div>
      </Modal>
    </>
  );
}

export default function Settings() {
  const toast = useToast();
  const { data, error, loading, reload } = useResource('/profile');
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/profile/export', { credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message || 'Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `credetect-export-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <SkeletonRows rows={5} />;
  if (error) return <ErrorAlert error={error} />;

  return (
    <>
      <PageHeader title="Settings" description={<>Signed in as <span className="mono">{data.user.email}</span></>} />
      <div className="stack-lg" style={{ maxWidth: 820 }}>
        <Section title="Profile" description="Used to match listings and sign removal requests. Stored encrypted.">
          <ProfileForm profile={data} onSaved={() => reload(true)} />
        </Section>
        <Section title="Contact details" description="Only verified contacts are scanned.">
          <ContactManager contacts={data.contacts} onChange={() => reload(true)} />
        </Section>
        <Section id="notifications" title="Notifications">
          <NotificationPrefs prefs={data.notificationPrefs} onSaved={() => reload(true)} />
        </Section>
        <Section title="Consent">
          <Consents active={data.consents} onChange={() => reload(true)} />
        </Section>
        <Section title="Your data" description="Export everything we hold about you, or delete it.">
          <div className="stack">
            <Alert tone="info">
              Contact details and request texts are encrypted at rest. Dismissed findings are deleted after 30 days and stale findings after 12 months. Read the <Link to="/privacy">privacy policy</Link> for full retention details.
            </Alert>
            <div className="row">
              <Button variant="secondary" onClick={exportData} loading={exporting}>Export my data (JSON)</Button>
              <DeleteAccount />
            </div>
            <p className="small faint">Member since {fmtDate(data.user.createdAt)}</p>
          </div>
        </Section>
      </div>
    </>
  );
}
