// Applies a saved theme choice before the page paints, so switching
// pages (or reloading) never flashes the wrong theme for a moment.
// Loaded as a plain external script (not inline) because the site's CSP
// has no 'unsafe-inline' for scripts either — and placed first, non-
// deferred, in <head> so it runs and blocks rendering before styles.css
// is even applied. If nothing is saved yet, the page just stays on the
// default (dark) theme baked into :root.
(function () {
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.dataset.theme = saved;
    }
  } catch (e) {
    // localStorage can throw in some locked-down browser contexts —
    // falling back to the default theme is a fine outcome either way.
  }
})();
