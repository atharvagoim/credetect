# Deploying to Vercel

## 1. MongoDB Atlas
1. Create a free M0 cluster at cloud.mongodb.com (pick Mumbai `ap-south-1` for lower latency).
2. Database Access → add a user with read/write.
3. Network Access → add `0.0.0.0/0` (Vercel functions don't have fixed IPs).
4. Connect → Drivers → copy the `mongodb+srv://...` string and add `/parda` before the `?`.

Indexes (including TTL indexes for sessions, tokens, rate limits, notifications and audit logs) are created automatically on first connection.

## 2. Secrets
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # run 3 times
```
Use the outputs for `DATA_ENCRYPTION_KEY`, `HMAC_SECRET` and `CRON_SECRET`. **Back up `DATA_ENCRYPTION_KEY`**: losing or changing it makes stored contacts and requests unreadable.

## 3. Vercel
1. Push the folder to GitHub, then Vercel → Add New → Project → import it. Framework preset: Vite (auto). Leave build settings as they are.
2. Settings → Environment Variables, add (Production and Preview):
   - `MONGODB_URI`, `DATA_ENCRYPTION_KEY`, `HMAC_SECRET`, `CRON_SECRET`
   - `APP_URL` = `https://<your-project>.vercel.app` (or your domain)
   - `ADMIN_EMAILS` = your email
   - SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`)
3. Deploy, then open `https://<your-app>/api/health`. `ok: true` and `db: "connected"` means you're live.
4. Register with the email in `ADMIN_EMAILS` to get the Admin console.

## 4. Cron
`vercel.json` schedules `/api/cron/tick` daily at 03:00 IST (Hobby plan limit is once per day). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. On Pro, change the schedule to e.g. `*/15 * * * *` for faster retries and follow-ups. Elsewhere, run `node scripts/worker.js` from any scheduler.

## 5. Optional integrations
- **Have I Been Pwned:** buy a key at haveibeenpwned.com/API/Key, set `HIBP_API_KEY`.
- **SMS OTP:** TextBee (`TEXTBEE_API_KEY`, `TEXTBEE_DEVICE_ID`, needs an Android phone with a SIM) or Twilio `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (an Indian sender requires DLT registration with your provider).
- **Razorpay:** set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`. For the monthly plan, create a ₹199/month plan in Razorpay and set `RAZORPAY_MONITOR_PLAN_ID`. Add a webhook to `https://<your-app>/api/billing/webhook` with events `payment.captured`, `order.paid`, `payment.failed`, `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`, and set `RAZORPAY_WEBHOOK_SECRET`.

## Limits on Vercel
- Function max duration is set to 60s; scans cap page checks at 3 URLs and use per-source timeouts.
- Request bodies are capped at 64 KB.
