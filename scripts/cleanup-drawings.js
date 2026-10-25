// Lists (and with --delete removes) Pictionary drawing files that no game
// uses any more: old round backups and drawings replaced by a touch-up.
// Usage (from the project root):
//   node scripts/cleanup-drawings.js            # only list what would go
//   node scripts/cleanup-drawings.js --delete   # really delete
//   node scripts/cleanup-drawings.js --days=60  # only files older than 60 days (default 30)
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const DRAWINGS_DIR = path.join(__dirname, '..', 'public', 'images', 'drawings');
const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const doDelete = process.argv.includes('--delete');
const daysArg = process.argv.find(arg => arg.startsWith('--days='));
const days = daysArg ? Number(daysArg.split('=')[1]) : 30;

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
db.all('SELECT image_path FROM games WHERE image_path IS NOT NULL', (err, rows) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  const used = new Set(rows.map(row => path.basename(row.image_path)));
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let count = 0;
  let bytes = 0;

  for (const name of fs.readdirSync(DRAWINGS_DIR)) {
    const file = path.join(DRAWINGS_DIR, name);
    const stat = fs.statSync(file);
    if (!stat.isFile() || used.has(name) || stat.mtimeMs > cutoff) continue;
    count++;
    bytes += stat.size;
    console.log(`${doDelete ? 'Deleting' : 'Unused'}: ${name}`);
    if (doDelete) fs.unlinkSync(file);
  }
  console.log(`\n${count} unused file(s) older than ${days} days, ${(bytes / 1024).toFixed(0)} KB.` +
    (doDelete || count === 0 ? '' : ' Run again with --delete to remove them.'));
  db.close();
});
