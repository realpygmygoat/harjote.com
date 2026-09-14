/**
 * Creates a safe, consistent snapshot of the database — safe to run even
 * while the server is up, since VACUUM INTO is atomic (no risk of copying a
 * half-written file mid-write, unlike a plain file copy).
 *
 * Usage: node server/backup.js
 *
 * Keeps the 14 most recent backups and deletes older ones automatically.
 * Point a cron job / Windows Task Scheduler entry at this to back up daily.
 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "..", "data", "site.db");
const BACKUP_DIR = path.join(__dirname, "..", "data", "backups");
const KEEP = 14;

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.log("No database found yet at data/site.db — nothing to back up.");
    return;
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `site-${stamp}.db`);

  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  db.close();

  console.log(`Backed up to ${backupPath}`);

  // prune old backups beyond KEEP
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("site-") && f.endsWith(".db"))
    .sort();
  const excess = files.length - KEEP;
  if (excess > 0) {
    files.slice(0, excess).forEach((f) => {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`Removed old backup: ${f}`);
    });
  }
}

main();
