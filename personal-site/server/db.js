const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "site.db");

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS recovery_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS writing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    date TEXT,
    dek TEXT,
    body_md TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS travel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    place TEXT NOT NULL,
    date TEXT,
    coords TEXT,
    note TEXT,
    body_md TEXT,
    updated_at TEXT
  );
`);

// Upgrade path for databases created before 2FA existed: CREATE TABLE IF NOT
// EXISTS above won't add columns to an already-existing users table, so add
// them here if missing. Safe to run every startup — SQLite errors if the
// column is already there, which we just ignore.
for (const stmt of [
  "ALTER TABLE users ADD COLUMN totp_secret TEXT",
  "ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0",
]) {
  try { db.exec(stmt); } catch (_) { /* column already exists */ }
}

// ---------- settings (home hero + about page) ----------
function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function setSettings(obj) {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  for (const [key, value] of Object.entries(obj)) stmt.run(key, value ?? "");
}

// ---------- writing ----------
function listWriting() {
  return db.prepare("SELECT * FROM writing").all();
}
function getWriting(slug) {
  return db.prepare("SELECT * FROM writing WHERE slug = ?").get(slug) || null;
}
function upsertWriting({ slug, title, date, dek, body_md }, originalSlug) {
  const now = new Date().toISOString();
  const vals = [slug, title, date ?? null, dek ?? null, body_md ?? null];
  if (originalSlug) {
    db.prepare(
      "UPDATE writing SET slug=?, title=?, date=?, dek=?, body_md=?, updated_at=? WHERE slug=?"
    ).run(...vals, now, originalSlug);
  } else {
    db.prepare(
      "INSERT INTO writing (slug, title, date, dek, body_md, updated_at) VALUES (?,?,?,?,?,?)"
    ).run(...vals, now);
  }
}
function deleteWriting(slug) {
  db.prepare("DELETE FROM writing WHERE slug = ?").run(slug);
}

// ---------- travel ----------
function listTravel() {
  return db.prepare("SELECT * FROM travel").all();
}
function getTravel(slug) {
  return db.prepare("SELECT * FROM travel WHERE slug = ?").get(slug) || null;
}
function upsertTravel({ slug, place, date, coords, note, body_md }, originalSlug) {
  const now = new Date().toISOString();
  const vals = [slug, place, date ?? null, coords ?? null, note ?? null, body_md ?? null];
  if (originalSlug) {
    db.prepare(
      "UPDATE travel SET slug=?, place=?, date=?, coords=?, note=?, body_md=?, updated_at=? WHERE slug=?"
    ).run(...vals, now, originalSlug);
  } else {
    db.prepare(
      "INSERT INTO travel (slug, place, date, coords, note, body_md, updated_at) VALUES (?,?,?,?,?,?,?)"
    ).run(...vals, now);
  }
}
function deleteTravel(slug) {
  db.prepare("DELETE FROM travel WHERE slug = ?").run(slug);
}

// ---------- users ----------
function getUser(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) || null;
}
function anyUserExists() {
  return db.prepare("SELECT COUNT(*) AS c FROM users").get().c > 0;
}
function createUser(username, passwordHash, salt) {
  db.prepare("INSERT INTO users (username, password_hash, salt) VALUES (?,?,?)").run(
    username,
    passwordHash,
    salt
  );
}
function updateUserPassword(username, passwordHash, salt) {
  db.prepare("UPDATE users SET password_hash=?, salt=? WHERE username=?").run(
    passwordHash,
    salt,
    username
  );
}

// ---------- two-factor auth ----------
function setPendingTotpSecret(username, secret) {
  db.prepare("UPDATE users SET totp_secret=? WHERE username=?").run(secret, username);
}
function enableTotp(username) {
  db.prepare("UPDATE users SET totp_enabled=1 WHERE username=?").run(username);
}
function disableTotp(username) {
  db.prepare("UPDATE users SET totp_secret=NULL, totp_enabled=0 WHERE username=?").run(username);
  db.prepare("DELETE FROM recovery_codes WHERE username=?").run(username);
}

function replaceRecoveryCodes(username, codeHashes) {
  db.prepare("DELETE FROM recovery_codes WHERE username=?").run(username);
  const stmt = db.prepare("INSERT INTO recovery_codes (username, code_hash) VALUES (?, ?)");
  for (const hash of codeHashes) stmt.run(username, hash);
}

function countUnusedRecoveryCodes(username) {
  return db
    .prepare("SELECT COUNT(*) AS c FROM recovery_codes WHERE username=? AND used=0")
    .get(username).c;
}

// Checks a recovery code against this user's unused codes; marks it used and
// returns true on a match, otherwise returns false. Codes are single-use.
function consumeRecoveryCode(username, codeHash) {
  const row = db
    .prepare("SELECT id FROM recovery_codes WHERE username=? AND code_hash=? AND used=0")
    .get(username, codeHash);
  if (!row) return false;
  db.prepare("UPDATE recovery_codes SET used=1 WHERE id=?").run(row.id);
  return true;
}

module.exports = {
  db,
  getSettings, setSettings,
  listWriting, getWriting, upsertWriting, deleteWriting,
  listTravel, getTravel, upsertTravel, deleteTravel,
  getUser, anyUserExists, createUser, updateUserPassword,
  setPendingTotpSecret, enableTotp, disableTotp,
  replaceRecoveryCodes, countUnusedRecoveryCodes, consumeRecoveryCode,
};
