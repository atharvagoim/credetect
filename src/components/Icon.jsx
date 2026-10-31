/** SF Symbols-style line icons: 24px grid, rounded caps, 1.75 stroke. */
const PATHS = {
  home: <><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1v-9" /></>,
  findings: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  removals: <><path d="M5 7h14" /><path d="M9.5 7V5h5v2" /><path d="m7 7 .8 11.2a1 1 0 0 0 1 .8h6.4a1 1 0 0 0 1-.8L17 7" /></>,
  scans: <><path d="M4 8V6a2 2 0 0 1 2-2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M20 16v2a2 2 0 0 1-2 2h-2" /><path d="M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M4 12h16" /></>,
  monitoring: <><path d="M3 12h4l2.5-6 5 12 2.5-6H21" /></>,
  bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" /></>,
  plans: <><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M3.5 10h17" /></>,
  admin: <><path d="M12 3.5 5 6v5.5c0 4 2.8 7 7 9 4.2-2 7-5 7-9V6z" /><path d="m9.5 12 1.8 1.8 3.4-3.6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="m15 6-6 6 6 6" />,
  shield: <><path d="M12 3.5 5 6v5.5c0 4 2.8 7 7 9 4.2-2 7-5 7-9V6z" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  inbox: <><path d="M4 13.5 6.5 5h11L20 13.5" /><path d="M4 13.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4.5h-5a3 3 0 0 1-6 0z" /></>,
  empty: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12h7" /></>,
};

export function Icon({ name, size = 20, className = '', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`icon ${className}`.trim()} aria-hidden="true" focusable="false" {...props}>
      {PATHS[name] || PATHS.empty}
    </svg>
  );
}
