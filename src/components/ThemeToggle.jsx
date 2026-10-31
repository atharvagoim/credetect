import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';

const current = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

/** Light/dark switch. The initial theme is set by a script in index.html (saved choice, else the OS setting). */
export function ThemeToggle() {
  const [theme, setTheme] = useState(current);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f0f11' : '#ffffff');
  }, [theme]);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
    setTheme(next);
  };

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
    </button>
  );
}
