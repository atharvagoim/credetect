import { Icon } from '../components/Icon.jsx';
import { Link } from 'react-router';
import PricingGrid from '../components/PricingGrid.jsx';

const SAMPLE = [
  ['people-directory', 'phone', 'High'],
  ['caller-id lookup', 'phone', 'High'],
  ['business listing', 'email', 'Medium'],
  ['breach: acme', 'email', 'High'],
];

function Hero() {
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div>
          <span className="label">Personal data removal · India</span>
          <h1 style={{ marginTop: 16 }}>Your number is on <span className="grad">more lists</span> than you think.</h1>
          <p className="hero-lede">
            Credetect checks supported sources for your phone number, email and name, shows you the evidence, and helps you send removal requests you approve, with a full record of what happened.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-lg">Scan My Digital Footprint <Icon name="chevron" size={18} className="arrow" /></Link>
            <a href="#how" className="btn btn-secondary btn-lg">How it works</a>
          </div>
          <p className="hero-note">Free first scan. Coverage depends on the sources we support, listed below.</p>
        </div>
        <div className="hero-visual">
          <span className="orb orb-a" aria-hidden="true" />
          <span className="orb orb-b" aria-hidden="true" />
          <span className="chip-float chip-a" aria-hidden="true"><Icon name="shield" size={16} /> Encrypted</span>
          <span className="chip-float chip-b" aria-hidden="true"><Icon name="check" size={16} /> You approve</span>
          <figure className="terminal" aria-label="Illustrative example of scan output" style={{ margin: 0 }}>
            <div className="terminal-bar"><span>scan #0142</span><span>illustrative sample</span></div>
            <div className="terminal-body">
              <div className="terminal-row head"><span>source</span><span>match</span><span>confidence</span></div>
              {SAMPLE.map(([s, m, c]) => (
                <div className="terminal-row" key={s}><span>{s}</span><span>{m}</span><span>{c}</span></div>
              ))}
            </div>
            <div className="terminal-foot"><span>+91 ••••• •3210</span><span>4 findings · 3 removable</span></div>
          </figure>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ['01', 'Verify what is yours', 'Add your name, phone and email. We confirm you own each contact with a one-time code before searching for it.'],
  ['02', 'Scan supported sources', 'We check only sources that permit the lookup, respect robots.txt and rate limits, and never log in or bypass protections.'],
  ['03', 'Review the evidence', 'Each finding shows the source link, what matched, and a confidence level. Values stay masked unless you need them.'],
  ['04', 'Approve each request', 'We draft a removal request. You read the exact text, approve it, and we track replies, follow-ups and confirmation.'],
];

const SOURCES = [
  ['Data breaches', 'XposedOrNot · Have I Been Pwned', 'Email', 'Live. Breach data cannot be deleted; we show protective steps.'],
  ['Pages you point us to', 'Page check', 'Phone · Email · Name', 'Live. You provide specific public URLs; we check them and help you contact the site.'],
  ['People-search and caller-ID sites', 'Source adapters', 'Phone · Name', 'Added source by source, only where the site permits lookups. Not yet available.'],
];

export default function Landing() {
  return (
    <>
      <Hero />

      <section className="section" aria-labelledby="problem">
        <div className="container">
          <div className="section-head">
            <span className="label">The problem</span>
            <h2 id="problem">Leaked once, listed everywhere.</h2>
            <p>Phone numbers and emails end up in caller-ID apps, directories, resume boards and breach dumps. Finding them is tedious, and asking for removal is easy to give up on.</p>
          </div>
          <div className="grid-3">
            <div className="cell"><span className="label">Spread</span><h3>Copied between sites</h3><p>One public listing is scraped and republished. Removing the source matters more than chasing copies.</p></div>
            <div className="cell"><span className="label">Effort</span><h3>No single opt-out</h3><p>Every site has its own grievance officer, form or inbox. Requests stall without follow-up.</p></div>
            <div className="cell"><span className="label">Record</span><h3>Little proof</h3><p>Without dates, reference numbers and replies, it is hard to escalate when a site ignores you.</p></div>
          </div>
        </div>
      </section>

      <section className="section" id="how" aria-labelledby="how-h">
        <div className="container">
          <div className="section-head">
            <span className="label">How it works</span>
            <h2 id="how-h">Four steps. You approve every one that leaves Credetect.</h2>
          </div>
          <div className="grid-4">
            {STEPS.map(([n, t, d]) => (
              <div className="cell" key={n}><span className="label">{n}</span><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="coverage" aria-labelledby="coverage-h">
        <div className="container">
          <div className="section-head">
            <span className="label">Coverage</span>
            <h2 id="coverage-h">What we check today.</h2>
            <p>No service can scan the whole internet. We list every source we support and add new ones only when they allow the lookup.</p>
          </div>
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Source type</th><th>Integration</th><th>Data</th><th>Status</th></tr></thead>
              <tbody>
                {SOURCES.map(([a, b, c, d]) => (
                  <tr key={a}>
                    <td className="td-primary" data-label="Source"><strong>{a}</strong></td>
                    <td data-label="Integration" className="td-mono">{b}</td>
                    <td data-label="Data" className="td-mono">{c}</td>
                    <td data-label="Status" className="muted small" style={{ maxWidth: 360 }}>{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section" id="security" aria-labelledby="sec-h">
        <div className="container grid-2" style={{ alignItems: 'start' }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="label">Privacy and security</span>
            <h2 id="sec-h">A privacy tool should not become another leak.</h2>
            <p>We collect the minimum needed to search for you, keep it encrypted, and let you take it back.</p>
          </div>
          <dl className="kv" style={{ gridTemplateColumns: 'minmax(120px, 180px) 1fr', rowGap: 18 }}>
            <dt>Encryption</dt><dd>Phone numbers, emails, your name and every removal request are encrypted at rest with AES-256-GCM.</dd>
            <dt>Consent</dt><dd>Separate, versioned consent for processing, scanning, monitoring and each removal request, recorded in an audit trail.</dd>
            <dt>Minimal</dt><dd>No ID documents, no bank details, no OTPs from other services. Logs never contain your contact details.</dd>
            <dt>Your control</dt><dd>Export everything as JSON or delete your account at any time.</dd>
            <dt>Not for sale</dt><dd>We never sell or share your data. Your findings are visible only to you.</dd>
          </dl>
        </div>
      </section>

      <section className="section" id="pricing" aria-labelledby="pricing-h">
        <div className="container">
          <div className="section-head">
            <span className="label">Pricing</span>
            <h2 id="pricing-h">Start free. Pay when you want follow-through.</h2>
            <p>Prices in INR, inclusive of applicable taxes. Paid plans unlock more scans and monitoring; removal success always depends on the website.</p>
          </div>
          <PricingGrid />
        </div>
      </section>

      <section className="section" id="faq" aria-labelledby="faq-h">
        <div className="container grid-2" style={{ alignItems: 'start' }}>
          <div className="section-head">
            <span className="label">FAQ</span>
            <h2 id="faq-h">Straight answers.</h2>
          </div>
          <div className="faq">
            <details><summary>Will this stop spam and marketing calls?</summary><p>Not on its own. Removing listings reduces how easily your number is found, but numbers already sold or leaked keep circulating. Also register on the TRAI National Customer Preference Register (call or SMS 1909) and report unsolicited commercial calls through your operator or the TRAI DND app.</p></details>
            <details><summary>Do you scan the whole internet?</summary><p>No, and nobody honestly can. We check the sources listed above. Coverage grows as we add sources that permit lookups.</p></details>
            <details><summary>Can you guarantee removal?</summary><p>No. Each website decides. We draft clear requests citing the applicable Indian rules, track responses, and mark something removed only when the site confirms or our re-check shows it is gone.</p></details>
            <details><summary>Do you send requests without asking me?</summary><p>Never. You see the exact text and recipient first. Nothing is sent until you approve it.</p></details>
            <details><summary>What happens to my data if I leave?</summary><p>Delete your account in Settings and we erase your contacts, findings and requests. A minimal audit trail without your identity is kept for a limited period, as explained in our privacy policy.</p></details>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container row-between">
          <h2 style={{ maxWidth: 560 }}>See what supported sources show about you.</h2>
          <Link to="/register" className="btn btn-lg">Scan My Digital Footprint <Icon name="chevron" size={18} className="arrow" /></Link>
        </div>
      </section>
    </>
  );
}
