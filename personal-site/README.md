# harjote's personal site (server + admin version)

This version replaces the old "edit Markdown files, run a build script" workflow with
a small live server: you log in at `/admin`, write posts and travel entries in a
Markdown editor with live preview, and the site updates immediately. No npm install —
it only uses Node's built-in modules (including `node:sqlite` for the database).

**Requires Node.js 22.5 or newer** (you already have this from the earlier setup).
The database will print an `ExperimentalWarning` about SQLite on startup — that's
expected and harmless; it just means Node hasn't marked that built-in module fully
stable yet.

## What changed from the static version

- Content now lives in a SQLite database file (`data/site.db`), not `.md` files.
- There's no more `node build.js` / `dist/` step — the server renders every page
  live from the database.
- A login-protected admin panel lets you create, edit, and delete posts and travel
  entries from a browser, with a Markdown editor and live preview side by side.
- The old `content/*.md` files and `build.js` are kept in the project for
  reference/backup but are no longer used at runtime.

## First-time setup

1. **Import your existing content** (the posts/entries you already wrote as Markdown files):

   ```
   node server/migrate.js
   ```

   This reads everything in `content/` and loads it into `data/site.db`. Safe to
   re-run — it won't duplicate anything.

2. **Create your admin login:**

   ```
   node server/create-admin.js
   ```

   This asks for a username and password (typed input is masked with `*`).
   You can skip this step and instead create the account the first time you
   visit `/admin/login` in a browser — it'll detect no account exists yet and
   show a signup form instead of a login form.

3. **Start the server:**

   ```
   node server/server.js
   ```

   Then open `http://localhost:3000`. Log in at `http://localhost:3000/admin/login`.

## Day-to-day use

- **View the site:** `http://localhost:3000/`
- **Manage content:** `http://localhost:3000/admin` — lists all posts and travel
  entries with Edit/Delete links, plus buttons to add new ones.
- **Edit the homepage text or About page:** via the "Homepage" / "About page"
  links in the admin nav.
- Changes save immediately and are live on the site right away — no build/deploy
  step for content changes.

If you ever forget your password, run `node server/create-admin.js` again — it
detects the existing account and resets the password instead of creating a
duplicate.

## Two-factor authentication (2FA)

Go to **Security** in the admin nav to turn this on. It uses TOTP — the same
standard behind Google Authenticator, Authy, 1Password, and similar apps.

1. Click "Set up 2FA". You'll see a setup key.
2. In your authenticator app, choose "enter a setup key manually" (this app
   doesn't render a QR code — copying the key is just as secure, if slightly
   more typing) and paste it in.
3. Enter the current 6-digit code from the app to confirm it's working.
4. You'll be shown 8 **recovery codes** once. Save them somewhere safe (a
   password manager is ideal) — if you ever lose your phone, one of these
   gets you back in. Each code works exactly once.

Once enabled, logging in asks for your password, then the 6-digit code (or a
recovery code) on a second screen. From **Security**, you can also regenerate
your recovery codes or disable 2FA entirely — both require re-entering your
current password first, so someone with just a stolen session cookie can't
turn your protection off.

If you lose both your phone and your recovery codes, there's no in-app way
back in by design — the whole point is that a password alone isn't enough.
Recovery in that situation means directly editing `data/site.db` (setting
`totp_enabled = 0` for your user with a SQLite tool) or restoring from a
backup made before 2FA was enabled.

## Project layout

```
server/
  server.js       the HTTP server — routes, auth checks, security headers, wiring everything together
  db.js           SQLite schema + queries (node:sqlite, no npm package)
  auth.js         password hashing (scrypt), sessions, login rate limiting, pending-2FA state
  totp.js         TOTP/2FA implementation (RFC 6238) + recovery codes, built on Node's crypto only
  render.js       public-facing page templates (same design as before, output-escaped)
  migrate.js      one-time import of content/*.md into the database
  create-admin.js command-line tool to create/reset the admin login
  backup.js       creates a safe snapshot of the database (see "Backing up" below)
  admin.css       styling for the admin panel
  public-admin.js admin panel's client-side JS (live preview, delete confirmation)
  views/admin.js  admin panel page templates (login, dashboard, editors, 2FA setup)
  lib/markdown.js frontmatter + Markdown parsing, output escaping, shared across the app
data/
  site.db         the SQLite database (created automatically, not in the zip)
  backups/        snapshots created by backup.js
styles.css         the site's visual design — same file as before
content/           your original Markdown files — kept for reference, unused at runtime
build.js           the old static-site generator — kept for reference, unused at runtime
```

## Backing up

Run this any time, including while the server is running — it uses SQLite's
`VACUUM INTO`, which takes a consistent snapshot atomically, so there's no risk
of copying a half-written file mid-save (unlike a plain file copy):

```
node server/backup.js
```

Snapshots land in `data/backups/`, timestamped. The script keeps the 14 most
recent and deletes older ones automatically, so you can point a daily cron job
(Linux/Mac) or Task Scheduler entry (Windows) at this command and forget about it.

To restore: stop the server, copy the backup file you want over `data/site.db`,
then start the server again.

## Self-hosting this version

This is now a real running application, not a folder of static files, so hosting
it is a bit different from before:

- It needs to be **kept running continuously** (a crash or reboot stops the site).
  On a VPS or home server, a process manager like `pm2` or a systemd service will
  restart it automatically if it ever stops.
- It needs a **reverse proxy in front of it** for a real domain and HTTPS — nginx
  or Caddy sitting in front of this Node process, forwarding requests to
  `localhost:3000` and handling the TLS certificate (Caddy does this almost
  automatically with Let's Encrypt; nginx needs a bit more manual config).
- **Set `TRUST_PROXY=1`** as an environment variable once you're running behind
  that reverse proxy. This tells the server to trust the `X-Forwarded-*` headers
  the proxy adds, which is what makes the login cookie mark itself `Secure`
  (HTTPS-only) and makes rate-limiting track the real visitor IP instead of the
  proxy's own IP. Without a trusted proxy in front, the server deliberately
  ignores these headers — otherwise anyone could forge them.
- **Firewall the app port.** Only the reverse proxy should be able to reach
  `localhost:3000` directly; the internet should only ever reach nginx/Caddy on
  ports 80/443. On most Linux setups this means either binding the Node process
  to `127.0.0.1` only (it already does, by default, unless you change `PORT`
  binding) or adding a firewall rule (`ufw deny 3000`, or your cloud provider's
  security group) that blocks external traffic to that port.
- Back up `data/site.db` regularly — see "Backing up" above. It's the only
  thing you'd lose in a crash or disk failure.

Tell me what you're hosting on (a VPS, a Raspberry Pi, something else) and I'll
walk through the actual nginx/Caddy config, the process manager setup, and
pointing your domain at it.

## Keeping /admin off the public internet

By default, anyone who guesses `harjote.com/admin/login` reaches a real login
form (rate-limited, hashed passwords, optional 2FA — see "Security notes"
above). That's reasonable, but if you'd rather the admin panel not be
reachable from the public internet *at all*, do it at the reverse proxy, not
in the app — the routes still need to exist for you to use them, so "hidden"
has to mean the network literally can't route strangers to them.

The recommended setup, using [Tailscale](https://tailscale.com) (a free,
easy-to-run mesh VPN) with Caddy:

1. **Install Tailscale on the VPS** and join it to your tailnet:
   ```
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```
   Follow the printed link to approve the device in your Tailscale account.
2. **Install Tailscale on your own laptop/phone** and log into the same
   account. Any device on your tailnet can now reach the VPS by its private
   Tailscale IP (`100.x.y.z`) — nothing outside the tailnet can.
3. **Find the VPS's Tailscale IP:** `tailscale ip -4` on the VPS.
4. **Split your Caddy config** into a public site that 404s every
   admin-only path, and a private listener bound to the Tailscale IP that
   proxies everything (admin included). A ready-to-edit example is at
   [`deploy/Caddyfile.example`](deploy/Caddyfile.example) — copy it,
   swap in the real Tailscale IP, and reload Caddy
   (`sudo systemctl reload caddy`).
5. **Log in from anywhere** by visiting `http://<tailscale-ip>:8080/admin/login`
   with Tailscale running on your device. That traffic never touches the
   public internet — it's fine over plain HTTP because Tailscale's
   WireGuard tunnel already encrypts it end-to-end.

If you'd rather not install Tailscale, the same idea works with a plain
IP allowlist in Caddy (`remote_ip` matcher restricted to your known IPs) or
an SSH tunnel instead of a proxied listener — both are more brittle if your
IP changes or you travel, which is why Tailscale is the default recommendation
here.

## Security notes, honestly

This was built for a single-user personal site, not as hardened enterprise
software. Here's what's already handled, and what's still worth knowing:

**Handled:**
- Output is escaped everywhere user-supplied content is displayed (titles,
  travel notes, Markdown bodies, etc.) — tested directly against script-injection
  and `javascript:` link payloads.
- Passwords are hashed with `scrypt` (Node's built-in, well-regarded for this),
  never stored in plain text.
- Optional TOTP-based 2FA with recovery codes — see the section above.
- Login attempts are rate-limited: 5 failed tries locks that IP out for 15 minutes.
  The same limit applies separately to 2FA code attempts, so someone who steals
  a password still can't brute-force the second factor.
- Disabling 2FA or regenerating recovery codes requires re-entering the current
  password, so a hijacked session cookie alone can't turn off protection.
- The session cookie is `HttpOnly` and `SameSite=Lax` always, and adds `Secure`
  automatically once `TRUST_PROXY=1` confirms you're behind HTTPS.
- Security headers (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options)
  are set on every response, and the admin panel has no inline scripts or styles,
  so the CSP can stay strict.

**Still worth knowing:**
- Sessions are stored in memory — restarting the server logs you out. Fine for
  personal use, just don't expect "stay logged in forever."
- 2FA is optional, not required — turn it on from Security if you want it.
- `node:sqlite` still ships with an "experimental" warning label in the Node
  version you're likely running; fine at this scale, just worth knowing it's a
  newer part of Node.
- None of this replaces good password hygiene and keeping Node itself updated.
