import { useEffect, useState } from 'react';
import { Alert, Badge, Button, ErrorAlert, Field } from './ui.jsx';
import { api } from '../services/api.js';

function VerifyRow({ contact, onDone }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [resent, setResent] = useState(false);
  const verify = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post(`/contacts/${contact.id}/verify`, { code });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };
  const resend = async () => {
    setError(null);
    try {
      await api.post(`/contacts/${contact.id}/resend`);
      setResent(true);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form onSubmit={verify} className="stack-sm" style={{ marginTop: 12 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label={contact.type === 'phone' ? `Code for ${contact.masked}, sent to your account email` : `Code sent to ${contact.masked}`}>
          {(p) => <input {...p} className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />}
        </Field>
        <Button type="submit" loading={pending} disabled={code.length !== 6}>Verify</Button>
        <Button type="button" variant="ghost" size="sm" onClick={resend} disabled={resent}>{resent ? 'Code resent' : 'Resend code'}</Button>
      </div>
      <ErrorAlert error={error} title="Verification failed" />
    </form>
  );
}

export default function ContactManager({ contacts, onChange, compact }) {
  const [type, setType] = useState('phone');
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post('/contacts', { type, value });
      setValue('');
      onChange();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };
  const remove = async (c) => {
    if (!window.confirm(`Remove ${c.masked}? It will no longer be scanned.`)) return;
    await api.del(`/contacts/${c.id}`);
    onChange();
  };
  const toggleScan = async (c) => {
    await api.patch(`/contacts/${c.id}`, { scanEnabled: !c.scanEnabled });
    onChange();
  };

  return (
    <div className="stack">
      {contacts.length > 0 && (
        <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {contacts.map((c, i) => (
            <li key={c.id} style={{ padding: '14px 16px', borderTop: i ? '1px solid var(--border)' : 0 }}>
              <div className="row-between">
                <div className="row">
                  <span className="label" style={{ width: 48 }}>{c.type}</span>
                  <span className="num">{c.masked}</span>
                  {c.verified ? <Badge tone="ok" dot>Verified</Badge> : <Badge tone="warn" dot>Unverified</Badge>}
                  {c.verified && !c.scanEnabled && <Badge>Not scanned</Badge>}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  {!compact && c.verified && <Button variant="ghost" size="sm" onClick={() => toggleScan(c)}>{c.scanEnabled ? 'Pause scans' : 'Resume scans'}</Button>}
                  <Button variant="ghost" size="sm" onClick={() => remove(c)}>Remove</Button>
                </div>
              </div>
              {!c.verified && <VerifyRow contact={c} onDone={onChange} />}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="stack-sm">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Type">
            {(p) => (
              <select {...p} className="select" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 120 }}>
                <option value="phone">Phone</option>
                <option value="email">Email</option>
              </select>
            )}
          </Field>
          <div className="grow" style={{ minWidth: 200 }}>
            <Field label={type === 'phone' ? 'Mobile number' : 'Email address'}>
              {(p) =>
                type === 'phone' ? (
                  <div className="input-group">
                    <span className="prefix">IN</span>
                    <input {...p} className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" value={value} onChange={(e) => setValue(e.target.value)} />
                  </div>
                ) : (
                  <input {...p} className="input" type="email" autoComplete="email" placeholder="you@example.com" value={value} onChange={(e) => setValue(e.target.value)} />
                )
              }
            </Field>
          </div>
          <Button type="submit" variant="secondary" loading={pending} disabled={!value.trim()}>Add and send code</Button>
        </div>
        <p className="small muted">Indian numbers can be entered with or without +91. Other countries need the + prefix.</p>
        <ErrorAlert error={error} title="Could not add contact" />
      </form>
    </div>
  );
}
