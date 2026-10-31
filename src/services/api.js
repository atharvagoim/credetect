export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let csrfToken = null;
export const setCsrf = (t) => {
  if (t) csrfToken = t;
};

async function refreshCsrf() {
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  csrfToken = data.csrfToken || null;
}

async function request(method, path, body, { retried = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    if (!csrfToken) await refreshCsrf();
    headers['x-csrf-token'] = csrfToken;
  }
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (data?.csrfToken) csrfToken = data.csrfToken;
  if (!res.ok) {
    const e = data?.error || {};
    if (e.code === 'CSRF_FAILED' && !retried) {
      await refreshCsrf();
      return request(method, path, body, { retried: true });
    }
    throw new ApiError(res.status, e.code || 'HTTP_' + res.status, e.message || 'Request failed', e.details);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p, b) => request('DELETE', p, b),
};

export function qs(params) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : '';
}
