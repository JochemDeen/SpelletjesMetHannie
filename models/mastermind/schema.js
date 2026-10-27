//models/mastermind/schema.js
// Creates the Mastermind ("Woordle") tables (lazily, on first require).
const db = require('../db');
const logger = require('../../logger');

db.serialize(() => {
  // The shared word of the day, one row per date
  db.run(`
    CREATE TABLE IF NOT EXISTS mastermind_word (
      date TEXT PRIMARY KEY,
      word TEXT NOT NULL
    )
  `, (err) => {
    if (err) logger.error('Failed to create mastermind_word table:', err.message);
  });

  // One row per guess; feedback is a JSON array of 'correct'/'misplaced'/'incorrect'.
  // game_date is the (Dutch) day the guess belongs to; late is 1 when the
  // guess was made after that day, when catching up yesterday's word.
  db.run(`
    CREATE TABLE IF NOT EXISTS mastermind_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guess TEXT NOT NULL,
      feedback TEXT NOT NULL,
      wordOfTheDay TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      game_date TEXT,
      late INTEGER NOT NULL DEFAULT 0
    )
  `, (err) => {
    if (err) logger.error('Failed to create mastermind_results table:', err.message);
  });

  // Columns added after the table first went live. game_date (October 2026):
  // before that, days were cut at midnight UTC and derived from the
  // timestamp; older rows keep that UTC day, so history doesn't shift. late
  // (October 2026, catching up yesterday): every older guess was on time.
  db.all('PRAGMA table_info(mastermind_results)', (err, columns) => {
    if (err) return logger.error('Failed to inspect mastermind_results:', err.message);
    const addColumn = (name, definition, callback) => columns.some(c => c.name === name)
      ? callback(null)
      : db.run(`ALTER TABLE mastermind_results ADD COLUMN ${name} ${definition}`, callback);
    addColumn('game_date', 'TEXT', (err) => {
      if (err) return logger.error('Failed to add game_date column:', err.message);
      db.run('UPDATE mastermind_results SET game_date = date(timestamp) WHERE game_date IS NULL', function (err) {
        if (err) return logger.error('Failed to fill game_date:', err.message);
        if (this.changes) logger.info(`Filled game_date for ${this.changes} older Woordle guesses`);
      });
      db.run('CREATE INDEX IF NOT EXISTS idx_mastermind_results_date ON mastermind_results (game_date, user_id)');
    });
    addColumn('late', 'INTEGER NOT NULL DEFAULT 0', (err) => {
      if (err) logger.error('Failed to add late column:', err.message);
    });
  });

  // At most one Gemini hint per user per day
  db.run(`
    CREATE TABLE IF NOT EXISTS mastermind_hints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      word_of_the_day TEXT NOT NULL,
      date TEXT NOT NULL,
      hint_response TEXT NOT NULL,
      used_at TEXT NOT NULL,
      UNIQUE(user_id, date)
    )
  `, (err) => {
    if (err) logger.error('Failed to create mastermind_hints table:', err.message);
  });
});
