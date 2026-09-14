const { escapeHtml } = require("../lib/markdown");
const esc = escapeHtml;
function attr(str) { return esc(str).replace(/'/g, "&#39;"); }

function adminShell({ title, active, bodyHtml }) {
  const navItem = (href, label, key) =>
    `<a href="${href}"${active === key ? ' class="active"' : ""}>${label}</a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Newsreader:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
<link rel="stylesheet" href="/assets/admin.css">
</head>
<body>
<div class="admin-shell">
  <div class="admin-top">
    <a href="/admin" class="mark">Harjote<span>.</span> admin</a>
    <form method="POST" action="/admin/logout"><button class="btn secondary" type="submit">Log out</button></form>
  </div>
  <nav class="admin-nav">
    ${navItem("/admin", "Dashboard", "dashboard")}
    ${navItem("/admin/home", "Homepage", "home")}
    ${navItem("/admin/about", "About page", "about")}
    ${navItem("/admin/security", "Security", "security")}
    ${navItem("/", "View site", "view")}
  </nav>
  ${bodyHtml}
</div>
<script src="/assets/qrcode-generator.js" defer></script>
<script src="/assets/admin.js" defer></script>
</body>
</html>`;
}

function loginPage({ error, needsSetup } = {}) {
  const body = `<div class="login-shell">
    <h1 class="login-title">${needsSetup ? "Create admin account" : "Log in"}</h1>
    ${error ? `<div class="flash">${esc(error)}</div>` : ""}
    <form method="POST" action="/admin/login">
      <div class="field">
        <label>Username</label>
        <input type="text" name="username" autofocus required>
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" name="password" required>
      </div>
      ${needsSetup ? `<div class="field">
        <label>Confirm password</label>
        <input type="password" name="confirm" required>
      </div>` : ""}
      <button class="btn" type="submit">${needsSetup ? "Create account" : "Log in"}</button>
    </form>
  </div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Log in — Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Newsreader:wght@400;500&family=IBM+Plex+Mono&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
<link rel="stylesheet" href="/assets/admin.css">
</head>
<body>${body}</body>
</html>`;
}

function loginTwoFactorPage({ error } = {}) {
  const body = `<div class="login-shell">
    <h1 class="login-title">Enter your 2FA code</h1>
    <p class="hint login-hint">Open your authenticator app and enter the current 6-digit code, or use one of your recovery codes.</p>
    ${error ? `<div class="flash">${esc(error)}</div>` : ""}
    <form method="POST" action="/admin/login/2fa">
      <div class="field">
        <label>Code</label>
        <input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" autofocus required placeholder="123456 or a recovery code">
      </div>
      <button class="btn" type="submit">Verify</button>
    </form>
  </div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify — Admin</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Newsreader:wght@400;500&family=IBM+Plex+Mono&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
<link rel="stylesheet" href="/assets/admin.css">
</head>
<body>${body}</body>
</html>`;
}

function deleteButton({ action, confirmMsg }) {
  return `<form class="inline-form confirm-delete" method="POST" action="${action}" data-confirm="${attr(confirmMsg)}">
    <button type="submit" class="link-btn danger">Delete</button>
  </form>`;
}

function dashboardPage({ writing, travel }) {
  const writingRows = writing.length
    ? writing.map((p) => `<tr>
        <td class="mono">${esc(p.date)}</td>
        <td>${esc(p.title)}</td>
        <td class="flex-between">
          <a href="/writing/${p.slug}/edit">Edit</a>
          ${deleteButton({ action: `/writing/${p.slug}/delete`, confirmMsg: "Delete this post?" })}
        </td>
      </tr>`).join("\n")
    : `<tr><td colspan="3" class="hint">No posts yet.</td></tr>`;

  const travelRows = travel.length
    ? travel.map((t) => `<tr>
        <td class="mono">${esc(t.date)}</td>
        <td>${esc(t.place)}</td>
        <td class="flex-between">
          <a href="/travel/${t.slug}/edit">Edit</a>
          ${deleteButton({ action: `/travel/${t.slug}/delete`, confirmMsg: "Delete this entry?" })}
        </td>
      </tr>`).join("\n")
    : `<tr><td colspan="3" class="hint">No travel entries yet.</td></tr>`;

  const body = `<div class="admin-section">
      <div class="flex-between">
        <h2>Writing</h2>
        <a class="btn" href="/writing/new">New post</a>
      </div>
      <table class="admin-table">
        <tr><th>Date</th><th>Title</th><th></th></tr>
        ${writingRows}
      </table>
    </div>

    <div class="admin-section">
      <div class="flex-between">
        <h2>Travel</h2>
        <a class="btn" href="/travel/new">New entry</a>
      </div>
      <table class="admin-table">
        <tr><th>Date</th><th>Place</th><th></th></tr>
        ${travelRows}
      </table>
    </div>`;

  return adminShell({ title: "Dashboard", active: "dashboard", bodyHtml: body });
}

function writingFormPage({ post, isNew, error }) {
  const p = post || { slug: "", title: "", date: "", dek: "", body_md: "" };
  const body = `<h1>${isNew ? "New post" : "Edit post"}</h1>
    ${error ? `<div class="flash">${esc(error)}</div>` : ""}
    <form method="POST" action="${isNew ? "/writing/new" : `/writing/${p.slug}/edit`}">
      <div class="field">
        <label>Title</label>
        <input type="text" name="title" value="${attr(p.title)}" required>
      </div>
      <div class="field">
        <label>URL slug</label>
        <input type="text" name="slug" value="${attr(p.slug)}" placeholder="auto-generated from title if left blank">
        <div class="hint">Appears as /writing/&lt;slug&gt;/ — leave blank to generate from the title.</div>
      </div>
      <div class="field">
        <label>Date</label>
        <input type="text" name="date" value="${attr(p.date)}" placeholder="2026-09-13">
      </div>
      <div class="field">
        <label>Deck (one-line subtitle shown in lists)</label>
        <input type="text" name="dek" value="${attr(p.dek)}">
      </div>
      <div class="field">
        <label>Body (Markdown)</label>
        <div class="editor-grid">
          <textarea name="body_md" id="md-input">${esc(p.body_md)}</textarea>
          <div class="preview-pane article" id="md-preview"></div>
        </div>
      </div>
      <button class="btn" type="submit">Save</button>
      <a class="btn secondary" href="/admin">Cancel</a>
    </form>`;
  return adminShell({ title: isNew ? "New post" : "Edit post", active: "dashboard", bodyHtml: body });
}

function travelFormPage({ entry, isNew, error }) {
  const t = entry || { slug: "", place: "", date: "", coords: "", note: "", body_md: "" };
  const body = `<h1>${isNew ? "New travel entry" : "Edit travel entry"}</h1>
    ${error ? `<div class="flash">${esc(error)}</div>` : ""}
    <form method="POST" action="${isNew ? "/travel/new" : `/travel/${t.slug}/edit`}">
      <div class="field">
        <label>Place</label>
        <input type="text" name="place" value="${attr(t.place)}" required>
      </div>
      <div class="field">
        <label>URL slug</label>
        <input type="text" name="slug" value="${attr(t.slug)}" placeholder="auto-generated from place if left blank">
        <div class="hint">Appears as /travel/&lt;slug&gt;/ — leave blank to generate from the place name.</div>
      </div>
      <div class="field">
        <label>Date</label>
        <input type="text" name="date" value="${attr(t.date)}" placeholder="2026-09-13">
      </div>
      <div class="field">
        <label>Coordinates</label>
        <input type="text" name="coords" value="${attr(t.coords)}" placeholder="43.65°N, 79.38°W">
      </div>
      <div class="field">
        <label>Note (one line shown in the log list)</label>
        <input type="text" name="note" value="${attr(t.note)}">
      </div>
      <div class="field">
        <label>Full entry (Markdown)</label>
        <div class="editor-grid">
          <textarea name="body_md" id="md-input">${esc(t.body_md)}</textarea>
          <div class="preview-pane article" id="md-preview"></div>
        </div>
      </div>
      <button class="btn" type="submit">Save</button>
      <a class="btn secondary" href="/admin">Cancel</a>
    </form>`;
  return adminShell({ title: isNew ? "New travel entry" : "Edit travel entry", active: "dashboard", bodyHtml: body });
}

function homeSettingsPage({ settings }) {
  const s = settings || {};
  const body = `<h1>Homepage</h1>
    <form method="POST" action="/admin/home">
      <div class="field">
        <label>Kicker (small line above the headline)</label>
        <input type="text" name="home_kicker" value="${attr(s.home_kicker)}">
      </div>
      <div class="field">
        <label>Headline</label>
        <input type="text" name="home_headline" value="${attr(s.home_headline)}">
      </div>
      <div class="field">
        <label>Subhead</label>
        <textarea class="simple" name="home_subhead">${esc(s.home_subhead)}</textarea>
      </div>
      <div class="field">
        <label>"Now" line (sidebar)</label>
        <input type="text" name="home_now" value="${attr(s.home_now)}">
      </div>
      <button class="btn" type="submit">Save</button>
    </form>`;
  return adminShell({ title: "Homepage", active: "home", bodyHtml: body });
}

function aboutSettingsPage({ settings }) {
  const s = settings || {};
  const body = `<h1>About page</h1>
    <form method="POST" action="/admin/about">
      <div class="field">
        <label>Page title</label>
        <input type="text" name="about_title" value="${attr(s.about_title)}">
      </div>
      <div class="field">
        <label>Homepage teaser (short paragraph shown on the homepage)</label>
        <textarea class="simple" name="about_teaser">${esc(s.about_teaser)}</textarea>
      </div>
      <div class="field">
        <label>Full about page (Markdown)</label>
        <div class="editor-grid">
          <textarea name="about_body_md" id="md-input">${esc(s.about_body_md)}</textarea>
          <div class="preview-pane article" id="md-preview"></div>
        </div>
      </div>
      <button class="btn" type="submit">Save</button>
    </form>`;
  return adminShell({ title: "About page", active: "about", bodyHtml: body });
}

function securityPage({ user, recoveryCodesRemaining }) {
  const enabled = !!user.totp_enabled;
  const body = `<h1>Security</h1>

    <div class="admin-section">
      <h2>Two-factor authentication</h2>
      ${enabled
        ? `<p>Enabled — logging in requires your password plus a code from your authenticator app.</p>
           <p class="hint">${recoveryCodesRemaining} unused recovery code${recoveryCodesRemaining === 1 ? "" : "s"} remaining.</p>
           <form method="POST" action="/admin/security/2fa/regenerate-codes" class="stacked-form form-spaced">
             <div class="field">
               <label>Current password (to regenerate recovery codes)</label>
               <input type="password" name="password" required>
             </div>
             <button class="btn secondary" type="submit">Regenerate recovery codes</button>
           </form>
           <form method="POST" action="/admin/security/2fa/disable" class="stacked-form">
             <div class="field">
               <label>Current password (to disable 2FA)</label>
               <input type="password" name="password" required>
             </div>
             <button class="btn danger-solid" type="submit">Disable 2FA</button>
           </form>`
        : `<p>Not enabled. Add a second step at login using an authenticator app (Google Authenticator, Authy, 1Password, etc.).</p>
           <a class="btn" href="/admin/security/2fa/setup">Set up 2FA</a>`
      }
    </div>`;
  return adminShell({ title: "Security", active: "security", bodyHtml: body });
}

function twoFactorSetupPage({ secret, otpauthUri, error }) {
  const body = `<h1>Set up two-factor authentication</h1>
    ${error ? `<div class="flash">${esc(error)}</div>` : ""}
    <div class="admin-section">
      <p>1. Scan this with your authenticator app:</p>
      <div id="totp-qr" class="totp-qr" data-otpauth="${attr(otpauthUri)}" aria-label="QR code for two-factor setup — use manual entry below if it doesn't render">
        <noscript>Enable JavaScript to see the QR code, or use manual entry below.</noscript>
      </div>
      <details class="manual-entry">
        <summary>Can't scan it? Enter this key manually instead</summary>
        <p class="mono secret-key">${esc(secret)}</p>
        <p class="hint">Account name: Harjote's Site — leave time-based (TOTP), 6 digits, 30 seconds if asked.</p>
        <p class="hint">If your app accepts a setup URI directly, you can paste this instead: <span class="mono">${esc(otpauthUri)}</span></p>
      </details>
    </div>
    <div class="admin-section">
      <p>2. Enter the current 6-digit code from the app to confirm it's working:</p>
      <form method="POST" action="/admin/security/2fa/setup">
        <div class="field">
          <label>Code</label>
          <input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" autofocus required placeholder="123456">
        </div>
        <button class="btn" type="submit">Confirm and enable</button>
        <a class="btn secondary" href="/admin/security">Cancel</a>
      </form>
    </div>`;
  return adminShell({ title: "Set up 2FA", active: "security", bodyHtml: body });
}

function recoveryCodesPage({ codes }) {
  const list = codes.map((c) => `<li class="mono">${esc(c)}</li>`).join("\n");
  const body = `<h1>Save your recovery codes</h1>
    <div class="admin-section">
      <p>Two-factor authentication is now enabled. If you ever lose access to your authenticator app, one of these one-time codes will get you back in. <strong>They're shown only once — save them somewhere safe now</strong> (a password manager is ideal).</p>
      <ul class="recovery-codes">${list}</ul>
      <a class="btn" href="/admin/security">Done, I've saved them</a>
    </div>`;
  return adminShell({ title: "Recovery codes", active: "security", bodyHtml: body });
}

module.exports = {
  loginPage, loginTwoFactorPage, dashboardPage, writingFormPage, travelFormPage,
  homeSettingsPage, aboutSettingsPage, securityPage, twoFactorSetupPage, recoveryCodesPage,
};
