const crypto = require("crypto");

function makeSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

// In-memory session store. Simple by design for a single-user personal site —
// restarting the server logs you out, which is an acceptable trade-off here.
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function createSession(username) {
  const id = crypto.randomBytes(24).toString("hex");
  sessions.set(id, { username, expires: Date.now() + SESSION_TTL_MS });
  return id;
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const s = sessions.get(sessionId);
  if (!s) return null;
  if (Date.now() > s.expires) {
    sessions.delete(sessionId);
    return null;
  }
  return s;
}

function destroySession(sessionId) {
  sessions.delete(sessionId);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function sessionCookieHeader(sessionId, secure) {
  return `session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`;
}

function clearCookieHeader(secure) {
  return `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

// ---------- rate limiting (used for both password logins and 2FA codes) ----------
// In-memory, per-IP, keyed by a "bucket" so login attempts and 2FA attempts
// are tracked separately. Resets on restart — fine for a single-server
// personal site.
const rateLimitBuckets = new Map();
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkLoginRateLimit(ip, bucket = "login") {
  const key = `${bucket}:${ip}`;
  const rec = rateLimitBuckets.get(key);
  if (!rec) return { allowed: true };
  if (Date.now() - rec.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.delete(key);
    return { allowed: true };
  }
  if (rec.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterMinutes = Math.ceil((RATE_LIMIT_WINDOW_MS - (Date.now() - rec.firstAttempt)) / 60000);
    return { allowed: false, retryAfterMinutes };
  }
  return { allowed: true };
}

function recordFailedLogin(ip, bucket = "login") {
  const key = `${bucket}:${ip}`;
  const rec = rateLimitBuckets.get(key);
  if (!rec || Date.now() - rec.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { count: 1, firstAttempt: Date.now() });
  } else {
    rec.count += 1;
  }
}

function clearLoginAttempts(ip, bucket = "login") {
  rateLimitBuckets.delete(`${bucket}:${ip}`);
}

// ---------- pending 2FA sessions ----------
// Short-lived, separate from real sessions: created once a username+password
// check succeeds for a 2FA-enabled account, and only upgraded to a real
// session once the correct code (or a recovery code) is also provided.
const pendingTwoFactor = new Map();
const PENDING_2FA_TTL_MS = 10 * 60 * 1000; // 10 minutes to enter the code

function createPending2fa(username) {
  const token = crypto.randomBytes(24).toString("hex");
  pendingTwoFactor.set(token, { username, expires: Date.now() + PENDING_2FA_TTL_MS });
  return token;
}

function getPending2fa(token) {
  if (!token) return null;
  const p = pendingTwoFactor.get(token);
  if (!p) return null;
  if (Date.now() > p.expires) {
    pendingTwoFactor.delete(token);
    return null;
  }
  return p;
}

function destroyPending2fa(token) {
  pendingTwoFactor.delete(token);
}

function pending2faCookieHeader(token, secure) {
  return `pending2fa=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${PENDING_2FA_TTL_MS / 1000}${secure ? "; Secure" : ""}`;
}

function clearPending2faCookieHeader(secure) {
  return `pending2fa=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

// ---------- reverse-proxy awareness ----------
// Only trust X-Forwarded-* headers when explicitly told to (TRUST_PROXY=1),
// which you set once you're running behind nginx/Caddy. Without it, a client
// could forge these headers to fake HTTPS or spoof its IP for rate limiting.
function getClientIp(req) {
  if (process.env.TRUST_PROXY === "1" && req.headers["x-forwarded-for"]) {
    return req.headers["x-forwarded-for"].split(",")[0].trim();
  }
  return req.socket.remoteAddress;
}

function isHttpsRequest(req) {
  if (process.env.TRUST_PROXY === "1") return req.headers["x-forwarded-proto"] === "https";
  return false;
}

module.exports = {
  makeSalt, hashPassword, verifyPassword,
  createSession, getSession, destroySession,
  parseCookies, sessionCookieHeader, clearCookieHeader,
  checkLoginRateLimit, recordFailedLogin, clearLoginAttempts,
  createPending2fa, getPending2fa, destroyPending2fa,
  pending2faCookieHeader, clearPending2faCookieHeader,
  getClientIp, isHttpsRequest,
};
