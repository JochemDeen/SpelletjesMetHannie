//models/mastermind/reminder.js
// Once a (Dutch) day, a push reminder to everyone who hasn't played today's
// Woordle yet. Who gets it is decided by push.notify: only devices that turned
// notifications on, with the Woordle toggle on. The day it went out is stored
// (INSERT OR IGNORE), so a restart or a second check never sends it twice.
require('./schema');
const db = require('../db');
const push = require('../push');
const logger = require('../../logger');
const { todayNL } = require('./dates');

const REMINDER_HOUR = 10; // Dutch time
const LAST_HOUR = 21; // after a restart late in the evening, skip the day
const CHECK_EVERY_MS = 5 * 60 * 1000;

const hourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hourCycle: 'h23' });

db.run(`
  CREATE TABLE IF NOT EXISTS mastermind_reminders (
    date TEXT PRIMARY KEY,
    sent_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) logger.error('Failed to create mastermind_reminders table:', err.message);
});

function run(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}

function all(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function sendReminderIfDue() {
  const hour = Number(hourFormatter.format(new Date()));
  if (!push.isConfigured() || hour < REMINDER_HOUR || hour >= LAST_HOUR) return;
  const today = todayNL();
  const claimed = await run('INSERT OR IGNORE INTO mastermind_reminders (date) VALUES (?)', [today]);
  if (claimed.changes === 0) return;

  const rows = await all(`
    SELECT u.id FROM users u
    WHERE NOT EXISTS (
      SELECT 1 FROM mastermind_results r WHERE CAST(r.user_id AS INTEGER) = u.id AND r.game_date = ?
    )
  `, [today]);
  logger.info(`Woordle reminder for ${today}: ${rows.length} players haven't played yet.`);
  await push.notify(rows.map(r => r.id), 'woordle', {
    title: 'Woordle',
    body: 'Er staat een nieuw woord voor je klaar!',
    url: '/mastermind',
    tag: `woordle-${today}`
  });
}

function startDailyReminder() {
  const check = () => sendReminderIfDue().catch(err => logger.error('Woordle reminder failed:', err));
  setTimeout(check, 10 * 1000); // after the tables exist
  setInterval(check, CHECK_EVERY_MS);
}

module.exports = { startDailyReminder };
