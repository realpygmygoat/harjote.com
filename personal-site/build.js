/**
 * Static site builder for harjote's personal site.
 * No npm dependencies — just Node's built-in fs/path.
 *
 * Usage:
 *   node build.js
 *
 * Reads Markdown from ./content, writes static HTML into ./dist.
 * Deploy ./dist to any static file host or web server.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, "content");
const DIST_DIR = path.join(ROOT, "dist");
const SITE_TITLE = "Harjote Singh";

// ---------- tiny frontmatter parser ----------
// Supports simple "key: value" pairs between --- lines. No nested YAML.
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
    // strip surrounding quotes if present
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

// ---------- tiny markdown -> html converter ----------
// Supports: headings (##, ###), bold, italic, links, images, blockquotes,
// unordered lists, inline code, paragraphs. Good enough for personal essays;
// swap in a real Markdown library later if you need more.
function inline(text) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
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

    if (line === "") {
      flushList();
      flushQuote();
      continue;
    }
    if (line.startsWith("### ")) {
      flushList(); flushQuote();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      flushList(); flushQuote();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("> ")) {
      quoteBuffer.push(line.slice(2));
      continue;
    }
    if (line.startsWith("- ")) {
      flushQuote();
      listBuffer.push(line.slice(2));
      continue;
    }
    flushList(); flushQuote();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  flushQuote();
  return out.join("\n");
}

// ---------- content loading ----------
function loadCollection(dir) {
  const full = path.join(CONTENT_DIR, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(full, f), "utf8");
      const { data, body } = parseFrontmatter(raw);
      return { slug, ...data, html: mdToHtml(body) };
    });
}

function loadSingle(file) {
  const full = path.join(CONTENT_DIR, file);
  const raw = fs.readFileSync(full, "utf8");
  const { data, body } = parseFrontmatter(raw);
  return { ...data, html: mdToHtml(body) };
}

// ---------- layout ----------
function layout({ title, active, bodyHtml }) {
  const navItem = (href, label, key) =>
    `<a href="${href}"${active === key ? ' class="active"' : ""}>${label}</a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — ${SITE_TITLE}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Newsreader:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div>
      <a href="/" class="mark">Harjote<span>.</span></a>
      <nav class="primary">
        ${navItem("/writing/", "Writing", "writing")}
        ${navItem("/travel/", "Travel", "travel")}
        ${navItem("/about/", "About", "about")}
      </nav>
    </div>
    <div>
      <div class="now">
        <span class="mono">now</span>
        Toronto, ON — building toward independent consulting
      </div>
      <div class="social">
        <a href="#">LinkedIn</a>
        <a href="#">Email</a>
      </div>
    </div>
  </aside>
  <main id="top">
    ${bodyHtml}
  </main>
</div>
</body>
</html>`;
}

function footer() {
  return `<footer>
      <span class="mono">© ${new Date().getFullYear()} Harjote Singh</span>
      <div><a href="#">LinkedIn</a> &nbsp;·&nbsp; <a href="#">Email</a></div>
    </footer>`;
}

// ---------- page renderers ----------
function renderHome(home, writing, travel, about) {
  const latestWriting = writing.slice(0, 3);
  const latestTravel = travel.slice(0, 3);

  const writingRows = latestWriting
    .map(
      (p) => `<a class="row" href="/writing/${p.slug}/">
        <span class="date mono">${formatDateShort(p.date)}</span>
        <div>
          <div class="row-title">${p.title}</div>
          <div class="row-dek">${p.dek || ""}</div>
        </div>
      </a>`
    )
    .join("\n");

  const travelEntries = latestTravel
    .map(
      (t) => `<a class="entry" href="/travel/${t.slug}/">
          <div>
            <div class="coords mono">${t.coords || ""}</div>
            <div class="date mono">${t.date || ""}</div>
          </div>
          <div>
            <div class="place">${t.place}</div>
            <div class="note">${t.note || ""}</div>
          </div>
        </a>`
    )
    .join("\n");

  const body = `<section class="hero">
      <span class="mono kicker">${home.kicker}</span>
      <h1>${home.headline}</h1>
      <p>${home.subhead}</p>
    </section>

    <section id="writing">
      <div class="section-head">
        <h2>Recent writing</h2>
        <span class="mono count">${String(writing.length).padStart(2, "0")} entries</span>
      </div>
      ${writingRows}
    </section>

    <section id="travel">
      <div class="section-head">
        <h2>Travel log</h2>
        <span class="mono count">${travel.length} stops</span>
      </div>
      <div class="log">
        ${travelEntries}
      </div>
    </section>

    <section id="about">
      <div class="section-head"><h2>About</h2></div>
      <div class="about-teaser">
        <p>${about.teaser}</p>
        <a href="/about/">Read the full story</a>
      </div>
    </section>

    ${footer()}`;

  return layout({ title: "Home", active: "home", bodyHtml: body });
}

function renderWritingList(writing) {
  const rows = writing
    .map(
      (p) => `<a class="row" href="/writing/${p.slug}/">
        <span class="date mono">${formatDateShort(p.date)}</span>
        <div>
          <div class="row-title">${p.title}</div>
          <div class="row-dek">${p.dek || ""}</div>
        </div>
      </a>`
    )
    .join("\n");

  const body = `<div class="page-header">
      <span class="mono kicker">writing</span>
      <h1>Opinions, arguments, and things I couldn't stop thinking about.</h1>
    </div>
    <section>
      ${rows}
    </section>
    ${footer()}`;
  return layout({ title: "Writing", active: "writing", bodyHtml: body });
}

function renderWritingPost(post) {
  const body = `<a class="back-link" href="/writing/">&larr; All writing</a>
    <article class="article">
      <div class="meta">
        <span class="mono">${formatDateShort(post.date)}</span>
      </div>
      <h1>${post.title}</h1>
      ${post.html}
    </article>
    ${footer()}`;
  return layout({ title: post.title, active: "writing", bodyHtml: body });
}

function renderTravelList(travel) {
  const entries = travel
    .map(
      (t) => `<a class="entry" href="/travel/${t.slug}/">
          <div>
            <div class="coords mono">${t.coords || ""}</div>
            <div class="date mono">${t.date || ""}</div>
          </div>
          <div>
            <div class="place">${t.place}</div>
            <div class="note">${t.note || ""}</div>
          </div>
        </a>`
    )
    .join("\n");

  const body = `<div class="page-header">
      <span class="mono kicker">travel</span>
      <h1>A running log of where I've been.</h1>
    </div>
    <section>
      <div class="log">
        ${entries}
      </div>
    </section>
    ${footer()}`;
  return layout({ title: "Travel", active: "travel", bodyHtml: body });
}

function renderTravelEntry(entry) {
  const body = `<a class="back-link" href="/travel/">&larr; Full travel log</a>
    <article class="article">
      <div class="meta">
        <span class="mono">${entry.coords || ""}</span> &nbsp;·&nbsp;
        <span class="mono">${entry.date || ""}</span>
      </div>
      <h1>${entry.place}</h1>
      ${entry.html}
    </article>
    ${footer()}`;
  return layout({ title: entry.place, active: "travel", bodyHtml: body });
}

function renderAbout(about) {
  const body = `<article class="article">
      <h1>${about.title}</h1>
      ${about.html}
    </article>
    ${footer()}`;
  return layout({ title: "About", active: "about", bodyHtml: body });
}

// ---------- helpers ----------
function formatDateShort(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr; // e.g. "Home base"
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function writeFile(relPath, html) {
  const full = path.join(DIST_DIR, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html, "utf8");
}

function copyFile(src, destRel) {
  const dest = path.join(DIST_DIR, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, src), dest);
}

// ---------- build ----------
function build() {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });

  const home = loadSingle("home.md");
  const about = loadSingle("about.md");
  let writing = loadCollection("writing");
  let travel = loadCollection("travel");

  // newest first; entries without a parseable date sort to the top (e.g. "Home base")
  const byDateDesc = (a, b) => {
    const da = new Date(a.date), db = new Date(b.date);
    const va = isNaN(da) ? Infinity : da.getTime();
    const vb = isNaN(db) ? Infinity : db.getTime();
    return vb - va;
  };
  writing.sort(byDateDesc);
  travel.sort(byDateDesc);

  writeFile("index.html", renderHome(home, writing, travel, about));
  writeFile("writing/index.html", renderWritingList(writing));
  writing.forEach((p) => writeFile(`writing/${p.slug}/index.html`, renderWritingPost(p)));
  writeFile("travel/index.html", renderTravelList(travel));
  travel.forEach((t) => writeFile(`travel/${t.slug}/index.html`, renderTravelEntry(t)));
  writeFile("about/index.html", renderAbout(about));

  copyFile("styles.css", "assets/styles.css");

  console.log(`Built ${2 + writing.length + travel.length + 1} pages into ./dist`);
}

build();
