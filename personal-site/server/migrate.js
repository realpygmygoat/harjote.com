/**
 * One-time import: reads the old content/*.md files and loads them into the
 * database. Safe to run more than once — it overwrites matching slugs/settings
 * rather than duplicating them.
 *
 * Usage: node server/migrate.js
 */
const fs = require("fs");
const path = require("path");
const { parseFrontmatter } = require("./lib/markdown");
const db = require("./db");

const CONTENT_DIR = path.join(__dirname, "..", "content");

function loadCollectionRaw(dir) {
  const full = path.join(CONTENT_DIR, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(full, f), "utf8");
      const { data, body } = parseFrontmatter(raw);
      return { slug, ...data, body };
    });
}

function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("No content/ folder found — nothing to migrate.");
    return;
  }

  // home + about settings
  const homePath = path.join(CONTENT_DIR, "home.md");
  if (fs.existsSync(homePath)) {
    const { data } = parseFrontmatter(fs.readFileSync(homePath, "utf8"));
    db.setSettings({
      home_kicker: data.kicker || "",
      home_headline: data.headline || "",
      home_subhead: data.subhead || "",
      home_now: data.now || "",
    });
    console.log("Imported homepage settings.");
  }

  const aboutPath = path.join(CONTENT_DIR, "about.md");
  if (fs.existsSync(aboutPath)) {
    const { data, body } = parseFrontmatter(fs.readFileSync(aboutPath, "utf8"));
    db.setSettings({
      about_title: data.title || "About",
      about_teaser: data.teaser || "",
      about_body_md: body || "",
    });
    console.log("Imported about page.");
  }

  const writing = loadCollectionRaw("writing");
  writing.forEach((p) => {
    db.upsertWriting(
      { slug: p.slug, title: p.title, date: p.date, dek: p.dek, body_md: p.body },
      db.getWriting(p.slug) ? p.slug : undefined
    );
  });
  console.log(`Imported ${writing.length} writing post(s).`);

  const travel = loadCollectionRaw("travel");
  travel.forEach((t) => {
    db.upsertTravel(
      { slug: t.slug, place: t.place, date: t.date, coords: t.coords, note: t.note, body_md: t.body },
      db.getTravel(t.slug) ? t.slug : undefined
    );
  });
  console.log(`Imported ${travel.length} travel entr${travel.length === 1 ? "y" : "ies"}.`);

  console.log("\nDone. Your old content/*.md files are untouched — the database is a separate copy now.");
  console.log("Next: run `node server/create-admin.js` if you haven't set up a login yet, then `node server/server.js`.");
}

main();
