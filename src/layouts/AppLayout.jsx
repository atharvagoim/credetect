import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Icon } from '../components/Icon.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { Logo } from '../components/ui.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../services/api.js';

const NAV = [
  { to: '/app', label: 'Overview', end: true, icon: 'home' },
  { to: '/app/findings', label: 'Findings', icon: 'findings' },
  { to: '/app/removals', label: 'Removals', icon: 'removals' },
  { to: '/app/scans', label: 'Scans', icon: 'scans' },
  { to: '/app/monitoring', label: 'Monitoring', icon: 'monitoring' },
  { to: '/app/notifications', label: 'Notifications', count: 'unread', icon: 'bell' },
];
const TABS = [
  { to: '/app', label: 'Home', end: true, icon: 'home' },
  { to: '/app/findings', label: 'Findings', icon: 'findings' },
  { to: '/app/removals', label: 'Removals', icon: 'removals' },
  { to: '/app/notifications', label: 'Alerts', icon: 'bell', count: 'unread' },
];
const ACCOUNT = [
  { to: '/app/settings', label: 'Settings', icon: 'settings' },
  { to: '/app/plans', label: 'Plans', icon: 'plans' },
];

function Nav({ unread, isAdmin, onNavigate }) {
  const link = (item) => (
    <li key={item.to}>
      <NavLink to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onNavigate}>
        <span className="nav-label"><Icon name={item.icon} size={20} />{item.label}</span>
        {item.count && unread > 0 && <span className="count" aria-label={`${unread} unread`}>{unread}</span>}
      </NavLink>
    </li>
  );
  return (
    <nav aria-label="App">
      <ul className="nav-list">{NAV.map(link)}</ul>
      <div className="nav-section">
        <span className="label">Account</span>
        <ul className="nav-list">
          {ACCOUNT.map(link)}
          {isAdmin && link({ to: '/app/admin', label: 'Admin', icon: 'admin' })}
        </ul>
      </div>
    </nav>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setOpen(false);
    api.get('/notifications?limit=1&unread=true').then((d) => setUnread(d.unreadCount)).catch(() => {});
  }, [location.pathname]);

  const signOut = async () => {
    await logout();
    navigate('/login');
  };

  const foot = (
    <div className="stack-sm">
      <div className="break small">{user?.email}</div>
      <div className="row-between">
        <span className="label">{user?.plan?.tier} plan</span>
        <ThemeToggle />
        <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="sidebar">
        <Logo to="/app" />
        <Nav unread={unread} isAdmin={user?.role === 'admin'} />
        <div className="sidebar-foot">{foot}</div>
      </aside>
      <header className="app-topbar">
        <Logo to="/app" />
        <ThemeToggle />
        <button className="btn btn-secondary btn-sm" aria-expanded={open} aria-controls="app-drawer" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Menu'}
        </button>
      </header>
      {open && (
        <div className="drawer" id="app-drawer">
          <Nav unread={unread} isAdmin={user?.role === 'admin'} onNavigate={() => setOpen(false)} />
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>{foot}</div>
        </div>
      )}
      <main id="main" className="app-main">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Primary">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
            {t.count && unread > 0 && <i className="tab-dot" aria-label={`${unread} unread`} />}
          </NavLink>
        ))}
        <button type="button" className={`tab${open ? ' active' : ''}`} aria-expanded={open} aria-controls="app-drawer" onClick={() => setOpen((o) => !o)}>
          <Icon name="settings" size={22} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
