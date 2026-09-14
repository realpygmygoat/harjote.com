/**
 * Tiny, dependency-free frontmatter + Markdown parser.
 * Shared by the migration script and the live server.
 */

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const [, fm, body] = match;
  const data = {};
  fm.split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  });
  return { data, body: body.trim() };
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Only allow link/image URLs that can't execute script (blocks javascript:, data:, etc).
function sanitizeUrl(url) {
  const trimmed = String(url || "").trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  return "#";
}

function inline(text) {
  // Escape first so raw HTML/script in user content can never reach the page,
  // then layer the supported Markdown syntax on top of the escaped text.
  return escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `<img alt="${alt}" src="${sanitizeUrl(url)}">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${sanitizeUrl(url)}">${label}</a>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function mdToHtml(md) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let listBuffer = [];
  let quoteBuffer = [];

  function flushList() {
    if (listBuffer.length) {
      out.push("<ul>" + listBuffer.map((li) => `<li>${inline(li)}</li>`).join("") + "</ul>");
      listBuffer = [];
    }
  }
  function flushQuote() {
    if (quoteBuffer.length) {
      out.push(`<blockquote>${inline(quoteBuffer.join(" "))}</blockquote>`);
      quoteBuffer = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") { flushList(); flushQuote(); continue; }
    if (line.startsWith("### ")) { flushList(); flushQuote(); out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (line.startsWith("## ")) { flushList(); flushQuote(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith("> ")) { quoteBuffer.push(line.slice(2)); continue; }
    if (line.startsWith("- ")) { flushQuote(); listBuffer.push(line.slice(2)); continue; }
    flushList(); flushQuote();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  flushQuote();
  return out.join("\n");
}

function formatDateShort(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr; // e.g. "Home base"
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function byDateDesc(a, b) {
  const da = new Date(a.date), db = new Date(b.date);
  const va = isNaN(da) ? Infinity : da.getTime();
  const vb = isNaN(db) ? Infinity : db.getTime();
  return vb - va;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "entry";
}

module.exports = { parseFrontmatter, inline, mdToHtml, formatDateShort, byDateDesc, slugify, escapeHtml, sanitizeUrl };
