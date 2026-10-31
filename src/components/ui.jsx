import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon.jsx';
import { FINDING_STATUS, JOB_STATUS, REMOVAL_STATUS, REQUEST_STATUS } from '../utils/format.js';

export function Logo({ to = '/' }) {
  return (
    <Link to={to} className="logo" aria-label="Credetect home">
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 4v24" />
        <path d="M16 4c-5.5 4-8.5 8.2-8.5 12S10.5 24 16 28" />
        <path d="M16 4c5.5 4 8.5 8.2 8.5 12S21.5 24 16 28" />
      </svg>
      credetect
    </Link>
  );
}

export function Button({ variant = 'primary', size, block, loading, children, className = '', as: As, ...props }) {
  const cls = ['btn', variant !== 'primary' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  if (As) return <As className={cls} {...props}>{children}</As>;
  return (
    <button className={cls} disabled={loading || props.disabled} aria-busy={loading || undefined} {...props}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, id: idProp }) {
  const auto = useId();
  const id = idProp || auto;
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  const child = typeof children === 'function' ? children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined }) : children;
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {child}
      {hint && !error && <span id={`${id}-hint`} className="hint">{hint}</span>}
      {error && <span id={`${id}-err`} className="error" role="alert">{error}</span>}
    </div>
  );
}

export function Checkbox({ label, ...props }) {
  return (
    <label className="check">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function Toggle({ label, description, ...props }) {
  const id = useId();
  return (
    <div className="row-between">
      <div className="grow">
        <label htmlFor={id} style={{ fontWeight: 500, fontSize: 14 }}>{label}</label>
        {description && <p className="small muted">{description}</p>}
      </div>
      <input id={id} type="checkbox" role="switch" className="toggle" {...props} />
    </div>
  );
}

export function Badge({ tone = '', dot, children }) {
  return (
    <span className={`badge ${tone ? `badge-${tone}` : ''}`}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}


const STATUS_MAPS = { finding: FINDING_STATUS, removal: REMOVAL_STATUS, request: REQUEST_STATUS, job: JOB_STATUS };
export function StatusBadge({ kind, status }) {
  const s = STATUS_MAPS[kind]?.[status] || { label: status, tone: '' };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function Alert({ tone = 'info', title, children, action }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <div className="grow">
        {title && <div className="alert-title">{title}</div>}
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
}

export function ErrorAlert({ error, title = 'Something went wrong' }) {
  if (!error) return null;
  const details = Array.isArray(error.details) ? error.details.slice(1, 4) : [];
  return (
    <Alert tone="danger" title={title}>
      {error.message}
      {details.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{details.map((d, i) => <li key={i}>{d.message}</li>)}</ul>}
    </Alert>
  );
}

export function Skeleton({ h = 16, w = '100%', style }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 4 }) {
  return (
    <div className="card card-pad stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row">
          <Skeleton h={14} w="40%" />
          <Skeleton h={14} w="20%" />
          <Skeleton h={14} w="15%" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon = 'shield', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-glyph" aria-hidden="true"><Icon name={icon} size={30} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, crumb }) {
  return (
    <header className="page-head">
      <div>
        {crumb && <Link className="crumb" to={crumb.to}><Icon name="back" size={16} /> {crumb.label}</Link>}
        <h1>{title}</h1>
        {description && <p className="desc">{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, sub, loading }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      {loading ? <Skeleton h={30} w={60} style={{ marginTop: 8 }} /> : <div className="stat-value">{value}</div>}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Confidence({ value }) {
  const pct = Math.round((value || 0) * 100);
  const word = pct >= 85 ? 'High' : pct >= 60 ? 'Medium' : 'Low';
  return (
    <span className="confidence" title={`${pct}% confidence`}>
      <span className="confidence-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
      {word}
      <span className="sr-only">confidence, {pct} percent</span>
    </span>
  );
}

export function Modal({ open, title, onClose, children, footer, labelledBy }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const node = ref.current;
    node?.querySelector('input, textarea, select, button:not([data-close])')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab' && node) {
        const f = [...node.querySelectorAll('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const [first, last] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy || titleId} ref={ref}>
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close" data-close>Close</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Pagination({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="muted num">{(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
      <div className="row">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </nav>
  );
}

// ---------- Toasts ----------
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-region" aria-live="polite" role="status">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone === 'error' ? 'toast-error' : ''}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
