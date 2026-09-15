const { formatDateShort, mdToHtml, escapeHtml } = require("./lib/markdown");

const SITE_TITLE = "Harjote Singh";
const esc = escapeHtml;

// The three-chevron mark, adapted from the banner: three triangles fading
// from a solid fill to an outline. Used wherever a kicker line or section
// heading needs a small recurring graphic anchor.
//
// Unique per call (not per page) so multiple chevronMark() calls on the
// same page never collide — an SVG <clipPath>/<pattern> needs an id, and
// ids must be unique within one HTML document.
let chevronIdCounter = 0;

function chevronMark(size = 20) {
  const h = size;
  const w = Math.round((size * 66) / 34);
  const clipId = `chevron-clip-${chevronIdCounter++}`;
  const stripeId = `chevron-stripe-${chevronIdCounter++}`;
  // Fill colors come from classes in styles.css, not inline style attributes
  // — the site's CSP intentionally has no 'unsafe-inline' for style-src, so
  // an inline style="..." here would just get silently blocked. The
  // fill="url(#...)" references below are a different thing (a plain SVG
  // presentation attribute pointing at an in-document <pattern>/<clipPath>,
  // not a style attribute) and aren't affected by that restriction.
  //
  // The third triangle is stroked, not filled, and an SVG stroke is
  // centered on the path by default — half its width sits outside the
  // path's own edge, which made this one triangle read as visibly bigger
  // than the two solid ones next to it. Clipping the stroke to the path's
  // own shape keeps only the inward half, so its outer edge lines up
  // exactly with the filled triangles; the stroke-width is doubled in
  // styles.css to compensate, so the line still looks the same weight.
  //
  // The middle triangle is filled with a repeating <pattern> of horizontal
  // bars instead of a flat fill — the pattern's own <rect> still uses the
  // chevron-fill-sage class, so the stripe color stays theme-reactive.
  // y="2" starts the tile grid at the triangle's own top edge instead of
  // the SVG's origin (a <pattern> tiles from (0,0) by default, regardless
  // of where the shape it's filling actually sits) — the triangle spans
  // y=2 to y=32, a height of exactly six 5-unit tiles. Each tile's stripe
  // sits in the MIDDLE of the tile (rect y is a quarter of the tile height,
  // not 0) rather than flush against the tile's own top — that's what
  // makes the whole arrangement vertically centered: the small gap before
  // the very first stripe and the small gap after the very last stripe
  // end up exactly equal, instead of starting flush on a stripe and
  // ending wherever the last tile happens to land.
  return `<svg width="${w}" height="${h}" viewBox="0 0 66 34" class="chevron-mark" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 2 L22 17 L2 32 Z" class="chevron-fill-brass"></path>
    <pattern id="${stripeId}" x="0" y="2" width="5" height="5" patternUnits="userSpaceOnUse">
      <rect x="0" y="1.25" width="5" height="2.5" class="chevron-fill-sage"></rect>
    </pattern>
    <path d="M24 2 L44 17 L24 32 Z" fill="url(#${stripeId})"></path>
    <clipPath id="${clipId}"><path d="M46 2 L66 17 L46 32 Z"></path></clipPath>
    <path d="M46 2 L66 17 L46 32 Z" class="chevron-outline" clip-path="url(#${clipId})"></path>
  </svg>`;
}

// A kicker line (small mono label) with the chevron mark beside it —
// shared across every page that has one, so the motif reads as one system.
function kickerLine(text) {
  return `<div class="kicker-row">${chevronMark(14)}<span class="mono kicker">${esc(text)}</span></div>`;
}

function layout({ title, active, bodyHtml, now }) {
  const navItem = (href, label, key) =>
    `<a href="${href}"${active === key ? ' class="active"' : ""}>${label}</a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script src="/assets/theme-init.js"></script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — ${SITE_TITLE}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Newsreader:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
<div class="page-curtain" aria-hidden="true">
  <span class="mark curtain-mark">Harjote<span>.</span>${chevronMark(15)}</span>
</div>
<div class="shell">
  <aside class="sidebar">
    <div>
      <a href="/" class="mark">Harjote<span>.</span>${chevronMark(15)}</a>
      <nav class="primary">
        ${navItem("/writing/", "Writing", "writing")}
        ${navItem("/travel/", "Travel", "travel")}
        ${navItem("/about/", "About", "about")}
      </nav>
    </div>
    <div>
      <div class="now">
        <span class="mono">now</span>
        ${esc(now)}
      </div>
      <div class="social">
        <a href="#">LinkedIn</a>
        <a href="#">Email</a>
      </div>
      <button type="button" class="theme-toggle mono" aria-label="Switch to light theme">☀ light</button>
    </div>
  </aside>
  <main id="top">
    ${bodyHtml}
  </main>
</div>
<script src="/assets/page-transition.js" defer></script>
<script src="/assets/dot-field.js" defer></script>
<script src="/assets/lenis.min.js" defer></script>
<script src="/assets/site.js" defer></script>
${active === "home" ? '<script type="module" src="/assets/compass-scene.js"></script>' : ""}
</body>
</html>`;
}

function footer() {
  return `<footer>
      <span class="mono">© ${new Date().getFullYear()} Harjote Singh</span>
      <div><a href="#">LinkedIn</a> &nbsp;·&nbsp; <a href="#">Email</a></div>
    </footer>`;
}

function renderHome({ settings, writing, travel }) {
  const latestWriting = writing.slice(0, 3);
  const latestTravel = travel.slice(0, 3);

  const writingRows = latestWriting.map((p) => `<a class="row" href="/writing/${p.slug}/">
        <span class="date mono">${esc(formatDateShort(p.date))}</span>
        <div>
          <div class="row-title">${esc(p.title)}</div>
          <div class="row-dek">${esc(p.dek)}</div>
        </div>
      </a>`).join("\n");

  const travelEntries = latestTravel.map((t) => `<a class="entry" href="/travel/${t.slug}/">
          <div>
            <div class="coords mono">${esc(t.coords)}</div>
            <div class="date mono">${esc(t.date)}</div>
          </div>
          <div>
            <div class="place">${esc(t.place)}</div>
            <div class="note">${esc(t.note)}</div>
          </div>
        </a>`).join("\n");

  const body = `<section class="hero">
      <div class="hero-text">
        ${kickerLine(settings.home_kicker)}
        <h1>${esc(settings.home_headline)}</h1>
        <p>${esc(settings.home_subhead)}</p>
      </div>
      <div id="compass-scene" class="hero-visual" aria-hidden="true"></div>
    </section>

    <section id="writing">
      <div class="section-head">
        <div class="section-head-title">${chevronMark(16)}<h2>Recent writing</h2></div>
        <span class="mono count">${String(writing.length).padStart(2, "0")} entries</span>
      </div>
      ${writingRows}
    </section>

    <section id="travel">
      <div class="section-head">
        <div class="section-head-title">${chevronMark(16)}<h2>Travel log</h2></div>
        <span class="mono count">${travel.length} stops</span>
      </div>
      <div class="log">
        ${travelEntries}
      </div>
    </section>

    <section id="about">
      <div class="section-head"><div class="section-head-title">${chevronMark(16)}<h2>About</h2></div></div>
      <div class="about-teaser">
        <p>${esc(settings.about_teaser)}</p>
        <a href="/about/" class="magnetic-btn">Read the full story <span aria-hidden="true">&rarr;</span></a>
      </div>
    </section>

    ${footer()}`;

  return layout({ title: "Home", active: "home", bodyHtml: body, now: settings.home_now });
}

function renderWritingList({ settings, writing }) {
  const rows = writing.map((p) => `<a class="row" href="/writing/${p.slug}/">
        <span class="date mono">${esc(formatDateShort(p.date))}</span>
        <div>
          <div class="row-title">${esc(p.title)}</div>
          <div class="row-dek">${esc(p.dek)}</div>
        </div>
      </a>`).join("\n");

  const body = `<div class="page-header">
      ${kickerLine("writing")}
      <h1>Opinions, arguments, and things I couldn't stop thinking about.</h1>
    </div>
    <section>${rows}</section>
    ${footer()}`;
  return layout({ title: "Writing", active: "writing", bodyHtml: body, now: settings.home_now });
}

function renderWritingPost({ settings, post }) {
  const body = `<a class="back-link" href="/writing/">&larr; All writing</a>
    <article class="article">
      <div class="meta"><span class="mono">${esc(formatDateShort(post.date))}</span></div>
      <h1>${esc(post.title)}</h1>
      ${mdToHtml(post.body_md)}
    </article>
    ${footer()}`;
  return layout({ title: post.title, active: "writing", bodyHtml: body, now: settings.home_now });
}

function renderTravelList({ settings, travel }) {
  const entries = travel.map((t) => `<a class="entry" href="/travel/${t.slug}/">
          <div>
            <div class="coords mono">${esc(t.coords)}</div>
            <div class="date mono">${esc(t.date)}</div>
          </div>
          <div>
            <div class="place">${esc(t.place)}</div>
            <div class="note">${esc(t.note)}</div>
          </div>
        </a>`).join("\n");

  const body = `<div class="page-header">
      ${kickerLine("travel")}
      <h1>A running log of where I've been.</h1>
    </div>
    <section><div class="log">${entries}</div></section>
    ${footer()}`;
  return layout({ title: "Travel", active: "travel", bodyHtml: body, now: settings.home_now });
}

function renderTravelEntry({ settings, entry }) {
  const body = `<a class="back-link" href="/travel/">&larr; Full travel log</a>
    <article class="article">
      <div class="meta">
        <span class="mono">${esc(entry.coords)}</span> &nbsp;·&nbsp;
        <span class="mono">${esc(entry.date)}</span>
      </div>
      <h1>${esc(entry.place)}</h1>
      ${mdToHtml(entry.body_md)}
    </article>
    ${footer()}`;
  return layout({ title: entry.place, active: "travel", bodyHtml: body, now: settings.home_now });
}

function renderAbout({ settings }) {
  const focusAreas = ["Insight", "Impact", "Growth", "Automation"];
  const pills = focusAreas
    .map((label, i) => `<span class="pill${i % 2 ? " pill-sage" : ""}">${esc(label)}</span>`)
    .join("\n");

  const body = `<article class="article">
      ${kickerLine("Understanding systems. Creating better outcomes.")}
      <h1>${esc(settings.about_title || "About")}</h1>
      <div class="focus-areas">${pills}</div>
      <img class="about-photo" src="/assets/harjote.png" alt="${esc(settings.about_title || "Harjote Singh")}">
      ${mdToHtml(settings.about_body_md)}
    </article>
    ${footer()}`;
  return layout({ title: "About", active: "about", bodyHtml: body, now: settings.home_now });
}

function renderNotFound({ settings }) {
  const body = `<div class="page-header">
      ${kickerLine("404")}
      <h1>Nothing here.</h1>
      <p><a href="/">Go home</a> instead.</p>
    </div>
    ${footer()}`;
  return layout({ title: "Not found", active: null, bodyHtml: body, now: settings ? settings.home_now : "" });
}

module.exports = {
  layout, footer,
  renderHome, renderWritingList, renderWritingPost,
  renderTravelList, renderTravelEntry, renderAbout, renderNotFound,
};
