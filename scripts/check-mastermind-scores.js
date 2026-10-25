// Read-only check of the Woordle (Mastermind) monthly scores and "months won".
// Usage (from the project root): node scripts/check-mastermind-scores.js
//
// Recomputes everything straight from mastermind_results, independently of
// the app code, so the numbers can be compared with the scoreboard page.
// Opens the database read-only: it never changes anything.
const path = require('path');
const sqlite3 = require('sqlite3');

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
const POINTS = { 1: 8, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 };

function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
}

function pad(value, width) {
  return String(value).padEnd(width);
}

(async () => {
  const columns = await all('PRAGMA table_info(mastermind_results)');
  const hasGameDate = columns.some(c => c.name === 'game_date');
  const dayExpr = hasGameDate ? 'COALESCE(r.game_date, date(r.timestamp))' : 'date(r.timestamp)';
  console.log(`Day column: ${hasGameDate ? 'game_date (falls back to UTC date of timestamp)' : 'UTC date of timestamp (game_date not added yet)'}\n`);

  const rows = await all(`
    SELECT r.id, r.user_id, u.username, ${dayExpr} AS day, r.timestamp, r.feedback, r.wordOfTheDay
    FROM mastermind_results r LEFT JOIN users u ON u.id = r.user_id
    ORDER BY r.id`);

  // Group guesses per player per day
  const games = new Map();
  const anomalies = [];
  for (const row of rows) {
    if (!row.username) {
      anomalies.push(`row ${row.id}: user_id ${row.user_id} has no user`);
      continue;
    }
    const key = `${row.username}|${row.day}`;
    if (!games.has(key)) games.set(key, { username: row.username, day: row.day, feedback: [], timestamps: [], words: new Set() });
    const game = games.get(key);
    let feedback = [];
    try {
      feedback = JSON.parse(row.feedback);
    } catch (e) {
      anomalies.push(`row ${row.id}: feedback is not JSON`);
    }
    game.feedback.push(feedback);
    game.timestamps.push(row.timestamp);
    game.words.add(row.wordOfTheDay);
  }

  const months = {}; // month -> username -> { score, days, wins }
  for (const game of games.values()) {
    const winAt = game.feedback.findIndex(f => Array.isArray(f) && f.length && f.every(x => x === 'correct'));
    const guesses = game.feedback.length;
    if (guesses > 6) anomalies.push(`${game.day} ${game.username}: ${guesses} guesses (max 6)`);
    if (winAt !== -1 && winAt < guesses - 1) anomalies.push(`${game.day} ${game.username}: ${guesses - 1 - winAt} guess(es) after solving`);
    if (game.words.size > 1) anomalies.push(`${game.day} ${game.username}: guesses against ${game.words.size} different words`);
    const utcDays = new Set(game.timestamps.map(t => t.slice(0, 10)));
    if (utcDays.size > 1) anomalies.push(`${game.day} ${game.username}: guesses spread over UTC days ${[...utcDays].join(', ')}`);

    // Score as the app does: by number of guesses that day, 0 when not solved
    const score = winAt === -1 ? 0 : (POINTS[guesses] || 0);
    const month = game.day.slice(0, 7);
    months[month] = months[month] || {};
    const entry = months[month][game.username] = months[month][game.username] || { score: 0, days: 0, wins: 0 };
    entry.score += score;
    entry.days += 1;
    if (winAt !== -1) entry.wins += 1;
  }

  const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const won = {};    // months won with the current rule (top score must be > 0)
  const wonOld = {}; // months won with the old rule (a 0-0 month counted for everyone)

  for (const month of Object.keys(months).sort()) {
    const players = Object.entries(months[month]).sort((a, b) => b[1].score - a[1].score);
    const best = players.length ? players[0][1].score : 0;
    const winners = best > 0 ? players.filter(([, e]) => e.score === best).map(([name]) => name) : [];
    const oldWinners = players.filter(([, e]) => e.score === best).map(([name]) => name);
    const decided = month < currentMonth;

    console.log(`=== ${month}${decided ? '' : ' (current month, not counted yet)'}`);
    for (const [name, e] of players) {
      console.log(`  ${pad(name, 14)} ${pad(e.score + ' pt', 8)} ${e.days} days played, ${e.wins} won`);
    }
    console.log(`  Winner(s): ${winners.length ? winners.join(', ') + ` (${best} pt)` : 'none'}`);
    if (decided) {
      winners.forEach(name => { won[name] = (won[name] || 0) + 1; });
      oldWinners.forEach(name => { wonOld[name] = (wonOld[name] || 0) + 1; });
      if (winners.join() !== oldWinners.join()) {
        console.log(`  NOTE: the old rule credited ${oldWinners.join(', ')} for this month`);
      }
    }
    console.log('');
  }

  console.log('=== Months won (finished months only)');
  const names = [...new Set([...Object.keys(won), ...Object.keys(wonOld)])].sort((a, b) => (won[b] || 0) - (won[a] || 0));
  for (const name of names) {
    const diff = (wonOld[name] || 0) !== (won[name] || 0) ? `   (old rule: ${wonOld[name] || 0})` : '';
    console.log(`  ${pad(name, 14)} ${won[name] || 0}${diff}`);
  }

  console.log(`\n=== Anomalies (${anomalies.length})`);
  anomalies.forEach(a => console.log(`  ${a}`));
  db.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
