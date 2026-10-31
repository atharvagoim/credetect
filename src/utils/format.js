const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const fmtDate = (d) => (d ? dateFmt.format(new Date(d)) : '—');
export const fmtDateTime = (d) => (d ? dateTimeFmt.format(new Date(d)) : '—');

export function timeAgo(d) {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}

export const DATA_TYPE_LABEL = { email: 'Email', phone: 'Phone', name: 'Name' };

export const FINDING_STATUS = {
  new: { label: 'New', tone: 'info' },
  reviewed: { label: 'Reviewed', tone: '' },
  confirmed: { label: 'Confirmed mine', tone: 'ink' },
  dismissed: { label: 'Dismissed', tone: '' },
};

export const REMOVAL_STATUS = {
  none: { label: 'No request', tone: '' },
  in_progress: { label: 'In progress', tone: 'warn' },
  removed: { label: 'Removed', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'danger' },
  unable_to_remove: { label: 'Unable to remove', tone: 'danger' },
};

export const REQUEST_STATUS = {
  discovered: { label: 'Discovered', tone: '' },
  awaiting_consent: { label: 'Awaiting consent', tone: 'warn' },
  ready_to_submit: { label: 'Ready to submit', tone: 'info' },
  submitting: { label: 'Submitting', tone: 'info' },
  submitted: { label: 'Submitted', tone: 'info' },
  awaiting_response: { label: 'Awaiting response', tone: 'warn' },
  removed: { label: 'Removed', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'danger' },
  unable_to_remove: { label: 'Unable to remove', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: '' },
};

export const JOB_STATUS = {
  queued: { label: 'Queued', tone: '' },
  running: { label: 'Running', tone: 'info' },
  completed: { label: 'Completed', tone: 'ok' },
  partial: { label: 'Partial', tone: 'warn' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: '' },
};

export const SOURCE_RUN_STATUS = {
  pending: 'Pending',
  ok: 'Checked',
  skipped: 'Skipped',
  error: 'Unavailable',
  rate_limited: 'Rate limited',
  timeout: 'Timed out',
};

export const formatINR = (paise) => (paise == null ? '—' : `₹${(paise / 100).toLocaleString('en-IN')}`);
