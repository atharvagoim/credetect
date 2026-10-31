import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, Checkbox, ErrorAlert, Field } from '../components/ui.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../services/api.js';

const fieldErr = (error, path) => error?.details?.find((d) => d.path === path)?.message;
const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/app');

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [resent, setResent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const u = await login(email, password);
      navigate(u.onboardingCompleted ? safeNext(params.get('next')) : '/onboarding');
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    await api.post('/auth/resend-verification', { email }).catch(() => {});
    setResent(true);
  };

  return (
    <>
      <h1>Sign in</h1>
      <p className="sub">Welcome back.</p>
      <form className="stack" onSubmit={submit} noValidate>
        {error && error.code !== 'VALIDATION_ERROR' && (
          <Alert tone="danger" action={error.code === 'EMAIL_NOT_VERIFIED' && !resent ? <Button size="sm" variant="secondary" type="button" onClick={resend}>Resend link</Button> : null}>
            {resent ? 'A new verification link is on its way.' : error.message}
          </Alert>
        )}
        <Field label="Email" error={fieldErr(error, 'email')}>
          {(p) => <input {...p} className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" error={fieldErr(error, 'password')}>
          {(p) => <input {...p} className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <div className="row-between small">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <Button type="submit" block size="lg" loading={pending}>Sign in</Button>
      </form>
      <p className="auth-alt">New to Credetect? <Link to="/register">Create an account</Link></p>
    </>
  );
}

export function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      setDone(await api.post('/auth/register', { email, password, acceptTerms: accept }));
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  if (done)
    return (
      <div className="stack">
        <span className="label">Check your inbox</span>
        <h1>Verify your email</h1>
        <p className="muted">{done.message} The link expires in 24 hours.</p>
        <p className="auth-alt"><Link to="/login">Back to sign in</Link></p>
      </div>
    );

  return (
    <>
      <h1>Create your account</h1>
      <p className="sub">Your first scan is free. No card needed.</p>
      <form className="stack" onSubmit={submit} noValidate>
        {error && error.code !== 'VALIDATION_ERROR' && <ErrorAlert error={error} title="Could not create account" />}
        <Field label="Email" error={fieldErr(error, 'email')}>
          {(p) => <input {...p} className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" hint="At least 10 characters, with a letter and a number." error={fieldErr(error, 'password')}>
          {(p) => <input {...p} className="input" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Checkbox
          checked={accept}
          onChange={(e) => setAccept(e.target.checked)}
          label={<>I agree to the <Link to="/terms" target="_blank">Terms</Link> and have read the <Link to="/privacy" target="_blank">Privacy Policy</Link>.</>}
        />
        {fieldErr(error, 'acceptTerms') && <span className="error small" style={{ color: 'var(--danger)' }}>{fieldErr(error, 'acceptTerms')}</span>}
        <Button type="submit" block size="lg" loading={pending}>Create account</Button>
      </form>
      <p className="auth-alt">Already have an account? <Link to="/login">Sign in</Link></p>
    </>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'pending' });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get('token');
    if (!token) return setState({ status: 'error', message: 'This link is missing its token.' });
    api
      .post('/auth/verify-email', { token })
      .then((d) => {
        setUser(d.user);
        setState({ status: 'ok' });
        setTimeout(() => navigate(d.user.onboardingCompleted ? '/app' : '/onboarding'), 900);
      })
      .catch((e) => setState({ status: 'error', message: e.message }));
  }, [params, navigate, setUser]);

  return (
    <div className="stack">
      <span className="label">Email verification</span>
      {state.status === 'pending' && <h1>Verifying…</h1>}
      {state.status === 'ok' && (<><h1>Email verified</h1><p className="muted">Taking you to setup.</p></>)}
      {state.status === 'error' && (
        <>
          <h1>Link not valid</h1>
          <Alert tone="danger">{state.message}</Alert>
          <p className="muted small">Sign in to request a new verification link.</p>
          <Link to="/login" className="btn btn-secondary">Go to sign in</Link>
        </>
      )}
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      setMsg((await api.post('/auth/forgot-password', { email })).message);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <h1>Reset password</h1>
      <p className="sub">We will email you a single-use link.</p>
      {msg ? (
        <Alert tone="ok">{msg}</Alert>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <ErrorAlert error={error} title="Could not send link" />
          <Field label="Email">{(p) => <input {...p} className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Button type="submit" block size="lg" loading={pending}>Send reset link</Button>
        </form>
      )}
      <p className="auth-alt"><Link to="/login">Back to sign in</Link></p>
    </>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError({ message: 'Passwords do not match.' });
    setPending(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token: params.get('token') || '', password });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };
  if (done)
    return (
      <div className="stack">
        <h1>Password updated</h1>
        <p className="muted">All other sessions were signed out.</p>
        <Link to="/login" className="btn">Sign in</Link>
      </div>
    );
  return (
    <>
      <h1>Choose a new password</h1>
      <p className="sub">At least 10 characters, with a letter and a number.</p>
      <form className="stack" onSubmit={submit} noValidate>
        <ErrorAlert error={error} title="Could not reset password" />
        <Field label="New password">{(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <Field label="Confirm password">{(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        <Button type="submit" block size="lg" loading={pending}>Update password</Button>
      </form>
    </>
  );
}
