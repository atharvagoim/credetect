import request from 'supertest';
import { CookieAccessInfo } from 'cookiejar';
import { createApp } from '../server/app.js';
import { testHooks } from '../server/services/messaging.js';

export const app = createApp();

/** A supertest agent that keeps cookies and sends the CSRF header automatically. */
export async function agent() {
  const a = request.agent(app);
  await a.get('/api/auth/csrf');
  // Always send the current CSRF cookie value (it rotates on login).
  const csrf = () => a.jar.getCookie('parda_csrf', CookieAccessInfo.All)?.value || '';
  const wrap = (method) => (url) => a[method](url).set('x-csrf-token', csrf());
  return { raw: a, get csrf() { return csrf(); }, get: (u) => a.get(u), post: wrap('post'), patch: wrap('patch'), delete: wrap('delete') };
}

export const lastMessage = (to) => [...testHooks.sent].reverse().find((m) => m.to === to);
export const tokenFrom = (text) => text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
export const codeFrom = (text) => text.match(/\b(\d{6})\b/)?.[1];

export const PASSWORD = 'correct-horse-42';

/** Register, verify email, consent, add+verify a phone, finish onboarding. */
export async function onboardedUser(email = 'asha@example.com', { phone = '+91 98765 43210', name = 'Asha Verma' } = {}) {
  const a = await agent();
  await a.post('/api/auth/register').send({ email, password: PASSWORD, acceptTerms: true }).expect(202);
  const token = tokenFrom(lastMessage(email).text);
  await a.post('/api/auth/verify-email').send({ token }).expect(200);
  const b = a;
  await b.post('/api/consents').send({ scopes: ['data_processing', 'scanning', 'monitoring'], version: '2026-10-01' }).expect(200);
  await b.patch('/api/profile').send({ fullName: name }).expect(200);
  await b.post('/api/contacts').send({ type: 'email', value: email }).expect(201);
  if (phone) {
    const c = await b.post('/api/contacts').send({ type: 'phone', value: phone }).expect(201);
    const code = codeFrom(testHooks.sent.at(-1).text);
    await b.post(`/api/contacts/${c.body.contact.id}/verify`).send({ code }).expect(200);
  }
  await b.patch('/api/profile').send({ completeOnboarding: true }).expect(200);
  return b;
}
