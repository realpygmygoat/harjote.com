const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const db = require("./db");
const auth = require("./auth");
const totp = require("./totp");
const render = require("./render");
const admin = require("./views/admin");
const { mdToHtml, byDateDesc, slugify } = require("./lib/markdown");

const PORT = process.env.PORT || 3000;
// Default to localhost-only — the README's self-hosting section (and the
// Tailscale/Caddy setup for keeping /admin off the public internet) both
// assume this. Without an explicit host, Node's http.Server.listen()
// binds to every interface (confirmed: it listens on "::", not
// "127.0.0.1"), which would let anyone reach this process directly on a
// VPS's public IP, bypassing the reverse proxy entirely. Override with
// HOST=0.0.0.0 only if you specifically need that (e.g. inside a
// container where the container boundary is the real isolation).
const HOST = process.env.HOST || "127.0.0.1";
const ASSETS = {
  "/assets/styles.css": { file: path.join(__dirname, "..", "styles.css"), type: "text/css; charset=utf-8" },
  "/assets/admin.css": { file: path.join(__dirname, "admin.css"), type: "text/css; charset=utf-8" },
  "/assets/admin.js": { file: path.join(__dirname, "public-admin.js"), type: "application/javascript; charset=utf-8" },
  "/assets/qrcode-generator.js": { file: path.join(__dirname, "vendor", "qrcode-generator.js"), type: "application/javascript; charset=utf-8" },
  "/assets/lenis.min.js": { file: path.join(__dirname, "vendor", "lenis.min.js"), type: "application/javascript; charset=utf-8" },
  "/assets/site.js": { file: path.join(__dirname, "public-site.js"), type: "application/javascript; charset=utf-8" },
  "/assets/three.module.min.js": { file: path.join(__dirname, "vendor", "three.module.min.js"), type: "application/javascript; charset=utf-8" },
  "/assets/three.core.min.js": { file: path.join(__dirname, "vendor", "three.core.min.js"), type: "application/javascript; charset=utf-8" },
  "/assets/compass-scene.js": { file: path.join(__dirname, "compass-scene.js"), type: "application/javascript; charset=utf-8" },
  "/assets/harjote.png": { file: path.join(__dirname, "media", "harjote.png"), type: "image/png" },
  "/assets/theme-init.js": { file: path.join(__dirname, "theme-init.js"), type: "application/javascript; charset=utf-8" },
  "/assets/page-transition.js": { file: path.join(__dirname, "page-transition.js"), type: "application/javascript; charset=utf-8" },
  "/assets/dot-field.js": { file: path.join(__dirname, "dot-field.js"), type: "application/javascript; charset=utf-8" },
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer-when-downgrade",
  // No inline scripts/styles are used anywhere in the app, so this stays strict
  // (no 'unsafe-inline') without breaking anything.
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data: https:; " +
    "script-src 'self'; form-action 'self'; base-uri 'self'",
};

// ---------- small helpers ----------
function sendHtml(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}
function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers["Set-Cookie"] = cookie; // string or array of strings, both valid for Set-Cookie
  res.writeHead(302, headers);
  res.end();
}
function notFound(res, settings) {
  sendHtml(res, 404, render.renderNotFound({ settings }));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) req.destroy(); // basic safety cap (~5MB)
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
function parseFormBody(raw) {
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

function getSortedWriting() {
  return db.listWriting().sort(byDateDesc);
}
function getSortedTravel() {
  return db.listTravel().sort(byDateDesc);
}

function getSessionFromReq(req) {
  const cookies = auth.parseCookies(req);
  return auth.getSession(cookies.session);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(header, value);
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // static assets
    if (ASSETS[pathname]) {
      const asset = ASSETS[pathname];
      return fs.readFile(asset.file, (err, content) => {
        if (err) return notFound(res);
        res.writeHead(200, { "Content-Type": asset.type });
        res.end(content);
      });
    }

    const session = getSessionFromReq(req);
    const settings = db.getSettings();

    // ---------- auth routes ----------
    if (pathname === "/admin/login") {
      if (req.method === "GET") {
        const needsSetup = !db.anyUserExists();
        return sendHtml(res, 200, admin.loginPage({ needsSetup }));
      }
      if (req.method === "POST") {
        const ip = auth.getClientIp(req);
        const secure = auth.isHttpsRequest(req);
        const needsSetup = !db.anyUserExists();

        // Rate limit applies to real login attempts, not first-time account setup —
        // there's nothing to brute-force yet if no account exists.
        if (!needsSetup) {
          const rl = auth.checkLoginRateLimit(ip);
          if (!rl.allowed) {
            return sendHtml(res, 429, admin.loginPage({
              error: `Too many attempts. Try again in about ${rl.retryAfterMinutes} minute(s).`,
            }));
          }
        }

        const body = parseFormBody(await readBody(req));

        if (needsSetup) {
          if (!body.username || !body.password || body.password.length < 8) {
            return sendHtml(res, 400, admin.loginPage({ needsSetup, error: "Password must be at least 8 characters." }));
          }
          if (body.password !== body.confirm) {
            return sendHtml(res, 400, admin.loginPage({ needsSetup, error: "Passwords don't match." }));
          }
          const salt = auth.makeSalt();
          const hash = auth.hashPassword(body.password, salt);
          db.createUser(body.username, hash, salt);
          const sessionId = auth.createSession(body.username);
          return redirect(res, "/admin", auth.sessionCookieHeader(sessionId, secure));
        }

        const user = db.getUser(body.username || "");
        if (!user || !auth.verifyPassword(body.password || "", user.salt, user.password_hash)) {
          auth.recordFailedLogin(ip);
          return sendHtml(res, 401, admin.loginPage({ error: "Incorrect username or password." }));
        }
        auth.clearLoginAttempts(ip);

        if (user.totp_enabled) {
          // Password is correct, but 2FA is required — don't create a real
          // session yet. Park them in a short-lived "pending" state until
          // they also provide a valid code.
          const pendingToken = auth.createPending2fa(user.username);
          return redirect(res, "/admin/login/2fa", auth.pending2faCookieHeader(pendingToken, secure));
        }

        const sessionId = auth.createSession(user.username);
        return redirect(res, "/admin", auth.sessionCookieHeader(sessionId, secure));
      }
    }

    if (pathname === "/admin/login/2fa") {
      const cookies = auth.parseCookies(req);
      const pending = auth.getPending2fa(cookies.pending2fa);

      if (req.method === "GET") {
        if (!pending) return redirect(res, "/admin/login");
        return sendHtml(res, 200, admin.loginTwoFactorPage({}));
      }

      if (req.method === "POST") {
        if (!pending) return redirect(res, "/admin/login");

        const ip = auth.getClientIp(req);
        const secure = auth.isHttpsRequest(req);
        const rl = auth.checkLoginRateLimit(ip, "2fa");
        if (!rl.allowed) {
          return sendHtml(res, 429, admin.loginTwoFactorPage({
            error: `Too many attempts. Try again in about ${rl.retryAfterMinutes} minute(s).`,
          }));
        }

        const body = parseFormBody(await readBody(req));
        const user = db.getUser(pending.username);
        const code = (body.code || "").trim();

        const validTotp = user && totp.verifyTotp(user.totp_secret, code);
        const validRecovery = !validTotp && user && db.consumeRecoveryCode(user.username, totp.hashRecoveryCode(code));

        if (!validTotp && !validRecovery) {
          auth.recordFailedLogin(ip, "2fa");
          return sendHtml(res, 401, admin.loginTwoFactorPage({ error: "Incorrect code. Try again." }));
        }

        auth.clearLoginAttempts(ip, "2fa");
        auth.destroyPending2fa(cookies.pending2fa);
        const sessionId = auth.createSession(user.username);
        return redirect(res, "/admin", [
          auth.sessionCookieHeader(sessionId, secure),
          auth.clearPending2faCookieHeader(secure),
        ]);
      }
    }

    if (pathname === "/admin/logout" && req.method === "POST") {
      const cookies = auth.parseCookies(req);
      auth.destroySession(cookies.session);
      return redirect(res, "/admin/login", auth.clearCookieHeader(auth.isHttpsRequest(req)));
    }

    // ---------- everything under here requires login ----------
    const isAdminArea =
      pathname === "/admin" ||
      pathname.startsWith("/admin/") ||
      pathname === "/writing/new" ||
      /^\/writing\/[^/]+\/edit$/.test(pathname) ||
      /^\/writing\/[^/]+\/delete$/.test(pathname) ||
      pathname === "/travel/new" ||
      /^\/travel\/[^/]+\/edit$/.test(pathname) ||
      /^\/travel\/[^/]+\/delete$/.test(pathname);

    if (isAdminArea && !session) {
      return redirect(res, "/admin/login");
    }

    if (pathname === "/admin/api/preview" && req.method === "POST") {
      const raw = await readBody(req);
      let markdown = "";
      try { markdown = JSON.parse(raw).markdown || ""; } catch (_) {}
      return sendJson(res, 200, { html: mdToHtml(markdown) });
    }

    if (pathname === "/admin" && req.method === "GET") {
      return sendHtml(res, 200, admin.dashboardPage({ writing: getSortedWriting(), travel: getSortedTravel() }));
    }

    if (pathname === "/admin/home") {
      if (req.method === "GET") return sendHtml(res, 200, admin.homeSettingsPage({ settings }));
      if (req.method === "POST") {
        const body = parseFormBody(await readBody(req));
        db.setSettings({
          home_kicker: body.home_kicker,
          home_headline: body.home_headline,
          home_subhead: body.home_subhead,
          home_now: body.home_now,
        });
        return redirect(res, "/admin/home");
      }
    }

    if (pathname === "/admin/about") {
      if (req.method === "GET") return sendHtml(res, 200, admin.aboutSettingsPage({ settings }));
      if (req.method === "POST") {
        const body = parseFormBody(await readBody(req));
        db.setSettings({
          about_title: body.about_title,
          about_teaser: body.about_teaser,
          about_body_md: body.about_body_md,
        });
        return redirect(res, "/admin/about");
      }
    }

    if (pathname === "/admin/security" && req.method === "GET") {
      const user = db.getUser(session.username);
      return sendHtml(res, 200, admin.securityPage({
        user,
        recoveryCodesRemaining: db.countUnusedRecoveryCodes(session.username),
      }));
    }

    if (pathname === "/admin/security/2fa/setup") {
      const user = db.getUser(session.username);
      if (user.totp_enabled) return redirect(res, "/admin/security");

      if (req.method === "GET") {
        // Reuse an in-progress secret so refreshing the page doesn't
        // invalidate a code the person is about to type in.
        const secret = user.totp_secret || totp.generateSecret();
        if (!user.totp_secret) db.setPendingTotpSecret(user.username, secret);
        const otpauthUri = totp.buildOtpauthUri({ secret, username: user.username });
        return sendHtml(res, 200, admin.twoFactorSetupPage({
          secret: totp.formatSecretForDisplay(secret),
          otpauthUri,
        }));
      }

      if (req.method === "POST") {
        const body = parseFormBody(await readBody(req));
        const secret = user.totp_secret;
        if (!secret || !totp.verifyTotp(secret, body.code)) {
          const otpauthUri = totp.buildOtpauthUri({ secret, username: user.username });
          return sendHtml(res, 400, admin.twoFactorSetupPage({
            secret: totp.formatSecretForDisplay(secret || ""),
            otpauthUri,
            error: "That code didn't match. Make sure your device's clock is correct and try the current code.",
          }));
        }
        db.enableTotp(user.username);
        const codes = totp.generateRecoveryCodes();
        db.replaceRecoveryCodes(user.username, codes.map(totp.hashRecoveryCode));
        return sendHtml(res, 200, admin.recoveryCodesPage({ codes }));
      }
    }

    if (pathname === "/admin/security/2fa/disable" && req.method === "POST") {
      const user = db.getUser(session.username);
      const body = parseFormBody(await readBody(req));
      if (!auth.verifyPassword(body.password || "", user.salt, user.password_hash)) {
        return sendHtml(res, 401, admin.securityPage({
          user,
          recoveryCodesRemaining: db.countUnusedRecoveryCodes(session.username),
        }));
      }
      db.disableTotp(user.username);
      return redirect(res, "/admin/security");
    }

    if (pathname === "/admin/security/2fa/regenerate-codes" && req.method === "POST") {
      const user = db.getUser(session.username);
      const body = parseFormBody(await readBody(req));
      if (!user.totp_enabled || !auth.verifyPassword(body.password || "", user.salt, user.password_hash)) {
        return sendHtml(res, 401, admin.securityPage({
          user,
          recoveryCodesRemaining: db.countUnusedRecoveryCodes(session.username),
        }));
      }
      const codes = totp.generateRecoveryCodes();
      db.replaceRecoveryCodes(user.username, codes.map(totp.hashRecoveryCode));
      return sendHtml(res, 200, admin.recoveryCodesPage({ codes }));
    }

    // ---------- writing: admin create/edit/delete ----------
    if (pathname === "/writing/new") {
      if (req.method === "GET") return sendHtml(res, 200, admin.writingFormPage({ isNew: true }));
      if (req.method === "POST") {
        const body = parseFormBody(await readBody(req));
        const slug = slugify(body.slug || body.title);
        if (db.getWriting(slug)) {
          return sendHtml(res, 400, admin.writingFormPage({ isNew: true, post: body, error: "That URL slug is already in use." }));
        }
        db.upsertWriting({ slug, title: body.title, date: body.date, dek: body.dek, body_md: body.body_md });
        return redirect(res, "/admin");
      }
    }

    let m = pathname.match(/^\/writing\/([^/]+)\/edit$/);
    if (m) {
      const slug = m[1];
      const post = db.getWriting(slug);
      if (!post) return notFound(res, settings);
      if (req.method === "GET") return sendHtml(res, 200, admin.writingFormPage({ post, isNew: false }));
      if (req.method === "POST") {
        const body = parseFormBody(await readBody(req));
        const newSlug = slugify(body.slug || body.title);
        const clash = db.getWriting(newSlug);
        if (clash && newSlug !== slug) {
          return sendHtml(res, 400, admin.writingFormPage({ post: { ...body, slug }, isNew: false, error: "That URL slug is already in use." }));
        }
        db.upsertWriting({ slug: newSlug, title: body.title, date: body.date, dek: body.dek, body_md: body.body_md }, slug);
        return redirect(res, "/admin");
      }
    }

    m = pathname.match(/^\/writing\/([^/]+)\/delete$/);
    if (m && req.method === "POST") {
      db.deleteWriting(m[1]);
      return redirect(res, "/admin");
    }

    // ---------- travel: admin create/edit/delete ----------
    if (pathname === "/travel/new") {
      if (req.method === "GET") return sendHtml(res, 200, admin.travelFormPage({ isNew: true }));
      if (req.method === "POST") {
        const body = parseFormBody(await readBody(req));
        const slug = slugify(body.slug || body.place);
        if (db.getTravel(slug)) {
          return sendHtml(res, 400, admin.travelFormPage({ isNew: true, entry: body, error: "That URL slug is already in use." }));
        }
        db.upsertTravel({ slug, place: body.place, date: body.date, coords: body.coords, note: body.note, body_md: body.body_md });
        return redirect(res, "/admin");
      }
    }

    m = pathname.match(/^\/travel\/([^/]+)\/edit$/);
    if (m) {
      const slug = m[1];
      const entry = db.getTravel(slug);
      if (!entry) return notFound(res, settings);
      if (req.method === "GET") return sendHtml(res, 200, admin.travelFormPage({ entry, isNew: false }));
      if (req.method === "POST") {
        const body = parseFormBody(await readBody(req));
        const newSlug = slugify(body.slug || body.place);
        const clash = db.getTravel(newSlug);
        if (clash && newSlug !== slug) {
          return sendHtml(res, 400, admin.travelFormPage({ entry: { ...body, slug }, isNew: false, error: "That URL slug is already in use." }));
        }
        db.upsertTravel({ slug: newSlug, place: body.place, date: body.date, coords: body.coords, note: body.note, body_md: body.body_md }, slug);
        return redirect(res, "/admin");
      }
    }

    m = pathname.match(/^\/travel\/([^/]+)\/delete$/);
    if (m && req.method === "POST") {
      db.deleteTravel(m[1]);
      return redirect(res, "/admin");
    }

    // ---------- public site ----------
    if (pathname === "/" && req.method === "GET") {
      return sendHtml(res, 200, render.renderHome({ settings, writing: getSortedWriting(), travel: getSortedTravel() }));
    }

    if (pathname === "/writing/" && req.method === "GET") {
      return sendHtml(res, 200, render.renderWritingList({ settings, writing: getSortedWriting() }));
    }

    m = pathname.match(/^\/writing\/([^/]+)\/$/);
    if (m && req.method === "GET") {
      const post = db.getWriting(m[1]);
      if (!post) return notFound(res, settings);
      return sendHtml(res, 200, render.renderWritingPost({ settings, post }));
    }

    if (pathname === "/travel/" && req.method === "GET") {
      return sendHtml(res, 200, render.renderTravelList({ settings, travel: getSortedTravel() }));
    }

    m = pathname.match(/^\/travel\/([^/]+)\/$/);
    if (m && req.method === "GET") {
      const entry = db.getTravel(m[1]);
      if (!entry) return notFound(res, settings);
      return sendHtml(res, 200, render.renderTravelEntry({ settings, entry }));
    }

    if (pathname === "/about/" && req.method === "GET") {
      return sendHtml(res, 200, render.renderAbout({ settings }));
    }

    // Public content pages all live at trailing-slash URLs; redirect the
    // no-slash form instead of 404ing, since people will naturally type
    // or link to "/about" or "/writing/some-post".
    if (req.method === "GET") {
      if (pathname === "/about" || pathname === "/writing" || pathname === "/travel") {
        return redirect(res, pathname + "/");
      }
      m = pathname.match(/^\/writing\/([^/]+)$/);
      if (m && db.getWriting(m[1])) return redirect(res, pathname + "/");
      m = pathname.match(/^\/travel\/([^/]+)$/);
      if (m && db.getTravel(m[1])) return redirect(res, pathname + "/");
    }

    return notFound(res, settings);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Site running at http://localhost:${PORT}`);
  if (!db.anyUserExists()) {
    console.log(`No admin account yet — visit http://localhost:${PORT}/admin/login to create one.`);
  }
});
