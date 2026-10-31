import { Icon } from '../components/Icon.jsx';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CONSENT_TEXT, CONSENT_VERSION } from '../../shared/consents.js';
import ContactManager from '../components/ContactManager.jsx';
import { Button, Checkbox, ErrorAlert, Field, Logo, SkeletonRows } from '../components/ui.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../services/api.js';

const STEPS = ['Consent', 'Your details', 'Verify contacts', 'Start'];

export default function Onboarding() {
  const { refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [consents, setConsents] = useState({ data_processing: false, scanning: false });
  const [name, setName] = useState('');
  const [types, setTypes] = useState(['email', 'phone', 'name']);

  const load = async () => {
    const p = await api.get('/profile');
    setProfile(p);
    return p;
  };

  useEffect(() => {
    load().then((p) => {
      setName(p.fullName || '');
      setTypes(p.scanDataTypes);
      if (p.consents.includes('data_processing') && p.consents.includes('scanning')) setStep(p.fullName ? 2 : 1);
    });
  }, []);

  const run = async (fn) => {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  const saveConsent = () =>
    run(async () => {
      await api.post('/consents', { scopes: ['data_processing', 'scanning'], version: CONSENT_VERSION });
      await api.post('/contacts', { type: 'email', value: (await api.get('/auth/me')).user.email }).catch(() => {});
      await load();
      setStep(1);
    });

  const saveDetails = () =>
    run(async () => {
      await api.patch('/profile', { fullName: name, scanDataTypes: types });
      await load();
      setStep(2);
    });

  const finish = (scan) =>
    run(async () => {
      await api.patch('/profile', { completeOnboarding: true });
      await refresh();
      navigate(scan ? '/app/scans?start=1' : '/app');
    });

  if (!profile) return <div className="onboard"><SkeletonRows rows={3} /></div>;
  const verified = profile.contacts.filter((c) => c.verified);
  const toggleType = (t) => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <div>
      <header className="site-header">
        <div className="container">
          <Logo to="/" />
          <button className="btn btn-ghost btn-sm" onClick={() => logout().then(() => navigate('/'))}>Sign out</button>
        </div>
      </header>
      <main id="main" className="onboard">
        <div className="onboard-steps" aria-hidden="true">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}</div>
        <span className="label">Step {step + 1} of {STEPS.length} · {STEPS[step]}</span>

        {step === 0 && (
          <div className="stack-lg" style={{ marginTop: 12 }}>
            <div className="stack-sm">
              <h1 style={{ fontSize: 30 }}>Before we look for you</h1>
              <p className="muted">We only process your details with your permission. You can withdraw it in Settings at any time, which stops all scanning.</p>
            </div>
            <div className="card card-pad stack">
              <Checkbox checked={consents.data_processing} onChange={(e) => setConsents((c) => ({ ...c, data_processing: e.target.checked }))} label={CONSENT_TEXT.data_processing} />
              <hr className="divider" style={{ margin: '4px 0' }} />
              <Checkbox checked={consents.scanning} onChange={(e) => setConsents((c) => ({ ...c, scanning: e.target.checked }))} label={CONSENT_TEXT.scanning} />
            </div>
            <p className="small faint mono">Consent version {CONSENT_VERSION}</p>
            <ErrorAlert error={error} />
            <Button size="lg" onClick={saveConsent} loading={pending} disabled={!consents.data_processing || !consents.scanning}>I agree, continue</Button>
          </div>
        )}

        {step === 1 && (
          <div className="stack-lg" style={{ marginTop: 12 }}>
            <div className="stack-sm">
              <h1 style={{ fontSize: 30 }}>What should we look for?</h1>
              <p className="muted">Your name is used to match listings and to sign removal requests. It is stored encrypted.</p>
            </div>
            <Field label="Full name" hint="As it might appear on public listings.">
              {(p) => <input {...p} className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <fieldset className="card card-pad stack-sm" style={{ margin: 0 }}>
              <legend className="label" style={{ padding: '0 6px' }}>Data types to scan</legend>
              <Checkbox checked={types.includes('phone')} onChange={() => toggleType('phone')} label="Phone numbers" />
              <Checkbox checked={types.includes('email')} onChange={() => toggleType('email')} label="Email addresses" />
              <Checkbox checked={types.includes('name')} onChange={() => toggleType('name')} label="Full name (lower confidence; names are shared)" />
            </fieldset>
            <ErrorAlert error={error} title="Check your details" />
            <div className="row">
              <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
              <Button size="lg" onClick={saveDetails} loading={pending} disabled={name.trim().length < 2 || !types.length}>Continue</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack-lg" style={{ marginTop: 12 }}>
            <div className="stack-sm">
              <h1 style={{ fontSize: 30 }}>Verify your contact details</h1>
              <p className="muted">We only search for contacts you prove are yours. Your account email is already verified. Add your mobile number and enter the code we send.</p>
            </div>
            <ContactManager contacts={profile.contacts} onChange={load} compact />
            <div className="row">
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button size="lg" onClick={() => setStep(3)} disabled={!verified.length}>Continue</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack-lg" style={{ marginTop: 12 }}>
            <div className="stack-sm">
              <h1 style={{ fontSize: 30 }}>Ready to scan</h1>
              <p className="muted">We will check supported sources for {verified.length} verified contact{verified.length === 1 ? '' : 's'}{profile.scanDataTypes.includes('name') ? ' and your name' : ''}. Results usually take under a minute.</p>
            </div>
            <dl className="kv card card-pad">
              <dt>Name</dt><dd>{profile.fullName || '—'}</dd>
              <dt>Contacts</dt><dd className="num">{verified.map((c) => c.masked).join(', ')}</dd>
              <dt>Scanning</dt><dd>{profile.scanDataTypes.join(', ')}</dd>
            </dl>
            <ErrorAlert error={error} />
            <div className="row">
              <Button size="lg" onClick={() => finish(true)} loading={pending}>Scan My Digital Footprint <Icon name="chevron" size={18} className="arrow" /></Button>
              <Button variant="ghost" onClick={() => finish(false)} disabled={pending}>Go to dashboard</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
