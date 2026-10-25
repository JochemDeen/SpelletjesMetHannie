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

  // One row per guess; feedback is a JSON array of 'correct'/'misplaced'/'incorrect'
  db.run(`
    CREATE TABLE IF NOT EXISTS mastermind_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guess TEXT NOT NULL,
      feedback TEXT NOT NULL,
      wordOfTheDay TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )
  `, (err) => {
    if (err) logger.error('Failed to create mastermind_results table:', err.message);
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
