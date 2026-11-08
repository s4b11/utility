/* DESIGN.md 2.1: follow the system theme before first paint; the toggle overrides it for this session. */
(function () {
  var t = null;
  try { t = sessionStorage.getItem('theme'); } catch (e) { /* private mode */ }
  if (t !== 'light' && t !== 'dark') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
})();
