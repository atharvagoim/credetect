import { Link, useSearchParams } from 'react-router';

function Privacy() {
  return (
    <>
      <span className="label">Privacy policy · version 2026-10-01</span>
      <h1 style={{ margin: '12px 0 24px' }}>Privacy policy</h1>
      <p>Credetect exists to reduce how much of your personal information is exposed. This policy explains what we process, why, and for how long. Operators deploying Credetect should review it with their own counsel and update the contact details below.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> email address and a salted bcrypt hash of your password.</li>
        <li><strong>Search details you provide:</strong> full name, phone numbers and email addresses you verify. These are encrypted at rest (AES-256-GCM).</li>
        <li><strong>Results:</strong> source URLs, the type of data matched, confidence, and a masked evidence summary. We do not store copies of the pages we check.</li>
        <li><strong>Removal requests:</strong> the text you approve (encrypted), recipient, dates, reference IDs and evidence you add.</li>
        <li><strong>Consent and audit records:</strong> which consents you gave or withdrew and when, and actions taken on your account.</li>
      </ul>
      <p>We never ask for identity documents, bank details, card numbers or one-time passwords from other services. Payments are handled by Razorpay; we do not receive card or UPI details.</p>
      <h2>How we use it</h2>
      <p>Only to search supported sources for your verified details, show you the results, prepare and send removal requests you approve, send notifications you have enabled, and keep the service secure. We do not sell, rent or share your data for advertising. Your findings are never visible to other users. Administrators see aggregate operational data without your contact details.</p>
      <h2>Legal basis</h2>
      <p>We process your data on the basis of your consent, given separately for processing, scanning, monitoring and each removal request, in line with the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000. You can withdraw consent at any time in Settings.</p>
      <h2>Retention</h2>
      <ul>
        <li>Dismissed findings: deleted after 30 days.</li>
        <li>Findings not seen again for 12 months: deleted, unless a removal request is open.</li>
        <li>Notifications: deleted after 180 days. Development email previews: 24 hours.</li>
        <li>Audit records: kept up to 12 months. On account deletion they are detached from your identity.</li>
        <li>Payment records: kept as required by tax law, without a link to your deleted account.</li>
      </ul>
      <h2>Your rights</h2>
      <p>You can access and export your data (Settings → Export), correct it, withdraw consent, and delete your account. Removal requests already sent to third parties cannot be recalled.</p>
      <h2>Security</h2>
      <p>Encryption at rest for personal identifiers and request text, HTTP-only secure session cookies, CSRF protection, rate limiting, strict input validation, SSRF protection on any URL we fetch, and logs that exclude personal data.</p>
      <h2>Contact and grievances</h2>
      <p>Write to the Grievance Officer at the address published by the operator of this deployment. We aim to acknowledge within 24 hours and resolve within 15 days.</p>
    </>
  );
}

function Terms() {
  return (
    <>
      <span className="label">Terms of use · version 2026-10-01</span>
      <h1 style={{ margin: '12px 0 24px' }}>Terms of use</h1>
      <h2>Use it for yourself</h2>
      <p>You may only add contact details that belong to you and that you can verify. Using Credetect to find information about other people is prohibited and will result in account closure.</p>
      <h2>What we can and cannot do</h2>
      <p>We check only the sources listed in the app. We cannot search the whole internet. Websites decide whether to remove information; we do not guarantee removal or a reduction in unsolicited calls or messages.</p>
      <h2>Your approval</h2>
      <p>We send removal requests only after you approve the exact text. You are responsible for the accuracy of what you approve.</p>
      <h2>Payments</h2>
      <p>Paid plans are billed in INR through Razorpay. One-time plans last for the stated period. Monthly plans renew until cancelled.</p>
      <h2>Acceptable use</h2>
      <p>No automated access, abuse of rate limits, attempts to access other users' data, or use of the service to harass anyone.</p>
    </>
  );
}

function Unsubscribed() {
  const [params] = useSearchParams();
  const ok = params.get('status') === 'ok';
  return (
    <>
      <span className="label">Email preferences</span>
      <h1 style={{ margin: '12px 0 16px' }}>{ok ? 'You are unsubscribed' : 'Link not valid'}</h1>
      <p>{ok ? 'You will no longer receive notification emails. Security and account emails will still be sent.' : 'This unsubscribe link is invalid or has expired.'} You can change this any time in <Link to="/app/settings#notifications">Settings</Link>.</p>
    </>
  );
}

export default function Legal({ page }) {
  return (
    <div className="container" style={{ padding: '64px 24px 96px' }}>
      <article className="prose">
        {page === 'privacy' && <Privacy />}
        {page === 'terms' && <Terms />}
        {page === 'unsubscribed' && <Unsubscribed />}
      </article>
    </div>
  );
}
