// Applies the saved theme before first paint (kept as a file so the CSP can block inline scripts).
try {
  var t = localStorage.getItem('theme');
  document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'light');
}
