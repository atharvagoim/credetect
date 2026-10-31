# Security model

| Area | Implementation |
|---|---|
| Passwords | bcrypt (cost 12); 10+ chars with letter and digit; lockout after 8 failures for 15 min; timing-equalised login |
| Sessions | Random 256-bit token in an HTTP-only, Secure, SameSite=Lax `__Host-` cookie; only its SHA-256 is stored; TTL index; all sessions revoked on password reset |
| CSRF | Double-submit token (SameSite=Strict cookie + `x-csrf-token` header, rotated at login) plus Origin allow-list |
| CORS | Same-origin only; no `Access-Control-Allow-Origin` is ever sent |
| Tokens | Email-verify and reset tokens are single-use (atomic consume), hashed, expiring. OTPs are hashed, 10-minute, 5 attempts |
| Enumeration | Register, resend and forgot-password always return the same response |
| Authorization | Every user-owned query filters by `user: req.user._id`; admin routes require `role: admin` |
| Validation | Zod on every body, param and query; `$`/dotted keys stripped from bodies (NoSQL injection); 64 KB body cap |
| Rate limiting | MongoDB-backed fixed windows per IP, email or user; exceedances raise admin alerts |
| SSRF | http(s) only, ports 80/443, no credentials, DNS checked at connect time against private/reserved ranges (IPv4+IPv6), manual redirects re-validated, 8 s timeout, 1.5 MB cap, robots.txt respected |
| Data at rest | AES-256-GCM for contacts, full name and removal text; keyed HMAC for dedupe |
| Logging | Method, path (ids redacted, no query), status, duration. Never bodies, cookies, tokens or contact values |
| Admin | Aggregates and pseudonymous user refs only |
| Headers | Helmet on API; CSP, HSTS, frame-deny, nosniff on frontend via `vercel.json` |
| Retention | TTL indexes and cron cleanup; account deletion erases personal data and detaches audit logs |
| Payments | Razorpay signatures verified server-side; webhooks idempotent per event id |
