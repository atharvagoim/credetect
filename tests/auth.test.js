import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { agent, app, lastMessage, PASSWORD, tokenFrom } from './helpers.js';
import { testHooks } from '../server/services/messaging.js';
import { User, Session } from '../server/models/index.js';

describe('authentication', () => {
  it('registers without revealing whether an email exists', async () => {
    const a = await agent();
    const r1 = await a.post('/api/auth/register').send({ email: 'new@example.com', password: PASSWORD, acceptTerms: true });
    const r2 = await a.post('/api/auth/register').send({ email: 'new@example.com', password: PASSWORD, acceptTerms: true });
    expect(r1.status).toBe(202);
    expect(r2.status).toBe(202);
    expect(r1.body.message).toBe(r2.body.message);
    expect(await User.countDocuments()).toBe(1);
  });

  it('stores only a bcrypt hash of the password', async () => {
    const a = await agent();
    await a.post('/api/auth/register').send({ email: 'hash@example.com', password: PASSWORD, acceptTerms: true });
    const u = await User.findOne({ email: 'hash@example.com' }).select('+passwordHash');
    expect(u.passwordHash).not.toContain(PASSWORD);
    expect(u.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects weak passwords', async () => {
    const a = await agent();
    const r = await a.post('/api/auth/register').send({ email: 'w@example.com', password: 'short', acceptTerms: true });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('blocks login until the email is verified, then verifies with a single-use token', async () => {
    const a = await agent();
    await a.post('/api/auth/register').send({ email: 'v@example.com', password: PASSWORD, acceptTerms: true });
    const blocked = await a.post('/api/auth/login').send({ email: 'v@example.com', password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const token = tokenFrom(lastMessage('v@example.com').text);
    const ok = await a.post('/api/auth/verify-email').send({ token });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie'].join(';')).toMatch(/parda_session=.*HttpOnly/i);
    const reuse = await a.post('/api/auth/verify-email').send({ token });
    expect(reuse.status).toBe(400);

    const login = await a.post('/api/auth/login').send({ email: 'v@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it('returns the same error for unknown email and wrong password', async () => {
    const a = await agent();
    const r1 = await a.post('/api/auth/login').send({ email: 'nobody@example.com', password: PASSWORD });
    await User.create({ email: 'real@example.com', passwordHash: 'x', emailVerifiedAt: new Date() });
    const r2 = await a.post('/api/auth/login').send({ email: 'real@example.com', password: 'wrong-pass-123' });
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r1.body.error.message).toBe(r2.body.error.message);
  });

  it('rejects state-changing requests without a CSRF token', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: PASSWORD });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CSRF_FAILED');
  });

  it('rejects requests from a foreign Origin', async () => {
    const a = await agent();
    const r = await a.post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'a@example.com', password: PASSWORD });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('BAD_ORIGIN');
  });

  it('requires a session for protected routes', async () => {
    const r = await request(app).get('/api/profile');
    expect(r.status).toBe(401);
  });

  it('resets the password and revokes existing sessions', async () => {
    const a = await agent();
    await a.post('/api/auth/register').send({ email: 'r@example.com', password: PASSWORD, acceptTerms: true });
    await a.post('/api/auth/verify-email').send({ token: tokenFrom(lastMessage('r@example.com').text) });
    expect(await Session.countDocuments()).toBe(1);

    const b = await agent();
    const f = await b.post('/api/auth/forgot-password').send({ email: 'r@example.com' });
    expect(f.status).toBe(202);
    const unknown = await b.post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(unknown.body.message).toBe(f.body.message);

    const token = tokenFrom(lastMessage('r@example.com').text);
    const reset = await b.post('/api/auth/reset-password').send({ token, password: 'brand-new-pass-9' });
    expect(reset.status).toBe(200);
    expect(await Session.countDocuments()).toBe(0);
    const again = await b.post('/api/auth/reset-password').send({ token, password: 'another-pass-99' });
    expect(again.status).toBe(400);
    const login = await b.post('/api/auth/login').send({ email: 'r@example.com', password: 'brand-new-pass-9' });
    expect(login.status).toBe(200);
  });

  it('locks the account after repeated failures', async () => {
    const a = await agent();
    await a.post('/api/auth/register').send({ email: 'lock@example.com', password: PASSWORD, acceptTerms: true });
    await a.post('/api/auth/verify-email').send({ token: tokenFrom(lastMessage('lock@example.com').text) });
    let last;
    for (let i = 0; i < 9; i++) last = await a.post('/api/auth/login').send({ email: 'lock@example.com', password: 'wrong-password-1' });
    expect(last.status).toBe(423);
  });

  it('rate limits login attempts', async () => {
    const a = await agent();
    const statuses = [];
    for (let i = 0; i < 22; i++) statuses.push((await a.post('/api/auth/login').send({ email: `x${i}@example.com`, password: 'whatever-1' })).status);
    expect(statuses).toContain(429);
  });

  it('logs out and clears the session', async () => {
    const a = await agent();
    await a.post('/api/auth/register').send({ email: 'out@example.com', password: PASSWORD, acceptTerms: true });
    await a.post('/api/auth/verify-email').send({ token: tokenFrom(testHooks.sent.at(-1).text) });
    const me1 = await a.get('/api/auth/me');
    expect(me1.body.user.email).toBe('out@example.com');
    await a.raw.post('/api/auth/logout').set('x-csrf-token', me1.body.csrfToken).expect(200);
    const me2 = await a.get('/api/auth/me');
    expect(me2.body.user).toBeNull();
  });

  it('strips operator keys from JSON bodies (NoSQL injection)', async () => {
    const a = await agent();
    const r = await a.post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(r.status).toBe(400);
  });
});
