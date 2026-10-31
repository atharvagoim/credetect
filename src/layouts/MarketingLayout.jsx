import { Link, Outlet } from 'react-router';
import { Logo } from '../components/ui.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { useAuth } from '../hooks/useAuth.jsx';

export function SiteHeader() {
  const { user } = useAuth();
  return (
    <header className="site-header">
      <div className="container">
        <Logo />
        <nav className="site-nav" aria-label="Main">
          <a href="/#how">How it works</a>
          <a href="/#coverage">Coverage</a>
          <a href="/#security">Security</a>
          <a href="/#pricing">Pricing</a>
          <a href="/#faq">FAQ</a>
        </nav>
        <div className="row" style={{ gap: 8 }}>
          <ThemeToggle />
          {user ? (
            <Link to="/app" className="btn btn-sm">Open app</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">Sign in</Link>
              <Link to="/register" className="btn btn-sm">Get started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container cols">
        <div className="stack-sm">
          <Logo />
          <p style={{ maxWidth: 380 }}>Find where your personal information is exposed on supported sources, and request its removal with a clear record of every step.</p>
          <p className="small faint">Credetect does not guarantee deletion or an end to spam calls. Websites decide whether to remove information.</p>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Product</div>
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
          <Link to="/register">Create account</Link>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Legal</div>
          <Link to="/privacy">Privacy policy</Link>
          <Link to="/terms">Terms of use</Link>
          <span className="faint small" style={{ display: 'block', paddingTop: 8 }}>© {new Date().getFullYear()} Credetect</span>
        </div>
      </div>
    </footer>
  );
}

export default function MarketingLayout() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}

export function AuthLayout() {
  return (
    <div className="auth-page">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="container"><Logo /><ThemeToggle /></div>
      </header>
      <main id="main" className="auth-main">
        <div className="auth-card">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
