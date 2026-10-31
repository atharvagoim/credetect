# Credetect — personal data discovery and removal for India

Credetect helps people find where their phone number, email and name appear on **supported** sources, review the evidence, and send removal requests they approve, with an auditable record of every step.

It is one repository that deploys to **Vercel as a single project**: the React frontend is served as static files and the Express API runs as a serverless function under `/api`. No separate backend deploy.

```
parda/
  api/index.js          Vercel serverless entry (wraps the Express app)
  server/               Express API
    app.js              Middleware, security, route wiring
    config/             env + cached Mongo connection
    models/             Mongoose schemas (User, VerifiedContact, ConsentRecord, ScanJob,
                        ExposureFinding, RemovalRequest, SourceAdapter, Notification, AuditLog, ...)
    middleware/         sessions, CSRF, Mongo-backed rate limiting, validation, logging
    routes/             auth, profile/contacts/consent, scans/findings, removals, monitoring,
                        notifications, billing, admin, cron, health
    services/           scanner, removals workflow, consent, billing, messaging, notifications
    adapters/           source adapters (XposedOrNot, Have I Been Pwned, page check)
    jobs/tick.js        background worker (monitoring, retries, follow-ups, retention)
    utils/              AES-256-GCM encryption, PII masking, SSRF-safe fetch
  shared/               consent texts + plan catalogue used by both client and server
  src/                  React 19 app (plain CSS, React Router)
  tests/                Vitest + Supertest + in-memory MongoDB
  scripts/worker.js     run the worker outside Vercel (optional)
  docs/                 ADAPTERS.md, DEPLOYMENT.md, SECURITY.md
  vercel.json           rewrites, cron, security headers
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

Create a `.env` with at least `MONGODB_URI` (MongoDB Atlas), `DATA_ENCRYPTION_KEY`, `HMAC_SECRET` and your SMTP settings. Emails (verification links and codes) are sent through SMTP; nothing is simulated.

```bash
npm test           # 44 tests: auth, CSRF, isolation, removal workflow, SSRF, adapters, cron, export/delete
npm run build      # production build of the frontend
```

## Deploy to Vercel

See **docs/DEPLOYMENT.md**. Short version:

1. Create a free MongoDB Atlas cluster; allow network access from `0.0.0.0/0`.
2. Push this folder to GitHub and import it in Vercel (framework is detected as Vite).
3. Add environment variables from `.env.example` (at minimum `MONGODB_URI`, `DATA_ENCRYPTION_KEY`, `HMAC_SECRET`, `APP_URL`, `CRON_SECRET`, `ADMIN_EMAILS`, and SMTP).
4. Deploy. Open `/api/health` to check configuration.

## What is included

| Piece | Status |
|---|---|
| Auth, sessions, email verification, password reset | Real. Needs SMTP for real users. |
| Phone ownership verification | Real OTP flow. Sends SMS via TextBee or Twilio when configured; otherwise the code is emailed to the account email. |
| **XposedOrNot** | Real adapter for the free XposedOrNot breach API. No key needed. Breaches are shown as non-removable with protective steps. |
| **Have I Been Pwned** | Optional real adapter for the official, paid HIBP API. Set `HIBP_API_KEY`. |
| **Page check** | Real adapter. Users paste specific public URLs; the server fetches them with SSRF protection, robots.txt checks, size/time limits, and matches verified identifiers. Supports automatic removal verification. |
| Removal requests | Real. Sent by email (after approval) when SMTP is configured; for form-only sites the user submits and records the reference. |
| Payments | Razorpay orders/subscriptions with server-side signature verification. Disabled until keys are set; nothing is faked. |
| People-search / caller-ID sources | Not included. Add them only where a site permits the lookup (see docs/ADAPTERS.md). |

## Key decisions

- **One Vercel project.** Express runs as a single function; Mongo connection is cached across warm invocations.
- **No always-on worker.** Scans run inline in the request (bounded by timeouts). Anything that fails transiently is re-queued in MongoDB with backoff, and the daily Vercel Cron (`/api/cron/tick`) runs monitoring scans, retries, removal follow-ups, plan expiry and retention. Jobs are claimed with atomic leases, so overlapping runs are safe. Vercel Hobby allows one cron per day; on Pro you can tighten the schedule in `vercel.json`, or run `scripts/worker.js` anywhere.
- **Rate limits in MongoDB**, not memory, because serverless instances don't share memory.
- **Server-side sessions** in HTTP-only cookies (`__Host-` prefixed in production) plus double-submit CSRF and Origin checks.
- **Encryption at rest** for contact values, full name and removal request text; HMAC hashes for dedupe; masked values everywhere in the UI, logs and admin.
