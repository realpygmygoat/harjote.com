/**
 * TOTP (RFC 6238) + HOTP (RFC 4226), implemented with only Node's built-in
 * crypto module — no npm package (e.g. speakeasy/otplib) needed.
 *
 * Compatible with Google Authenticator, Authy, 1Password, etc. — anything
 * that reads a standard otpauth:// URI or accepts a base32 manual-entry key.
 */
const crypto = require("crypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160 bits, the RFC-recommended size
}

function hotp(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const counterBuf = Buffer.alloc(8);
  // 64-bit big-endian counter
  counterBuf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuf.writeUInt32BE(counter % 2 ** 32, 4);

  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 1_000_000).padStart(6, "0");
}

function totp(secretBase32, forTime = Date.now(), step = 30) {
  const counter = Math.floor(forTime / 1000 / step);
  return hotp(secretBase32, counter);
}

// Allows the code from one step before/after to account for clock drift and
// the few seconds it takes someone to type the code in.
function verifyTotp(secretBase32, token, { window = 1, step = 30, forTime = Date.now() } = {}) {
  if (!secretBase32 || !token) return false;
  const cleanToken = String(token).trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const counter = Math.floor(forTime / 1000 / step);
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const candidate = hotp(secretBase32, counter + errorWindow);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(cleanToken))) {
      return true;
    }
  }
  return false;
}

function buildOtpauthUri({ secret, username, issuer = "Harjote's Site" }) {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// Splits a base32 secret into 4-character groups for easier manual typing,
// e.g. "JBSW Y3DP EHPK 3PXP".
function formatSecretForDisplay(secret) {
  return secret.match(/.{1,4}/g).join(" ");
}

// ---------- recovery codes ----------
function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // 10 random base32 chars, grouped for readability: e.g. "K3F9-QX2R7T"
    const raw = base32Encode(crypto.randomBytes(7)).slice(0, 10);
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

function hashRecoveryCode(code) {
  // Recovery codes are long, random, and single-use (unlike passwords, which
  // are memorized and often weak) — a fast hash is appropriate here rather
  // than scrypt, which would just slow down every login for no added benefit.
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

module.exports = {
  generateSecret,
  totp,
  verifyTotp,
  buildOtpauthUri,
  formatSecretForDisplay,
  generateRecoveryCodes,
  hashRecoveryCode,
};
