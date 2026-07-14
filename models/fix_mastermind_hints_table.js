// One-off migration: mastermind_hints used to be uniquely keyed on (user_id, word_of_the_day).
// Since word_of_the_day is only excluded from re-use for ~1 month (see wordsService.getRecentlyUsedWords),
// a recurring word resurfaced a user's old hint as "already requested today" even when they hadn't
// asked that day. This rekeys the table on (user_id, date) instead.
//
// Run once, manually, from the project root: node models/fix_mastermind_hints_table.js
// Needs to be run both locally and on the AWS Lightsail host.
const sqlite3 = require('sqlite3').verbose();
const logger = require('../logger');

const db = new sqlite3.Database('database.sqlite', (err) => {
  if (err) {
    logger.error('Failed to connect to the database:', err.message);
    process.exit(1);
  } else {
    logger.info('Connected to the SQLite database');
  }
});

db.serialize(() => {
  db.run('BEGIN TRANSACTION;', (err) => {
    if (err) {
      logger.error('Failed to begin transaction:', err.message);
      return;
    }
    logger.info('Transaction started.');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS mastermind_hints_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      word_of_the_day TEXT NOT NULL,
      date TEXT NOT NULL,
      hint_response TEXT NOT NULL,
      used_at TEXT NOT NULL,
      UNIQUE(user_id, date)
    );
  `, (err) => {
    if (err) {
      logger.error('Failed to create mastermind_hints_new:', err.message);
      return;
    }
    logger.info('Created mastermind_hints_new.');
  });

  // Backfill date from used_at (ISO timestamp, so the first 10 chars are YYYY-MM-DD).
  // If a user somehow ended up with more than one row for the same calendar date, keep the earliest.
  db.run(`
    INSERT INTO mastermind_hints_new (id, user_id, word_of_the_day, date, hint_response, used_at)
    SELECT id, user_id, word_of_the_day, substr(used_at, 1, 10), hint_response, used_at
    FROM mastermind_hints
    WHERE id IN (
      SELECT MIN(id) FROM mastermind_hints GROUP BY user_id, substr(used_at, 1, 10)
    );
  `, (err) => {
    if (err) {
      logger.error('Failed to copy data into mastermind_hints_new:', err.message);
      return;
    }
    logger.info('Copied mastermind_hints data into mastermind_hints_new.');
  });

  db.run('DROP TABLE mastermind_hints;', (err) => {
    if (err) {
      logger.error('Failed to drop old mastermind_hints table:', err.message);
      return;
    }
    logger.info('Old mastermind_hints table dropped.');
  });

  db.run('ALTER TABLE mastermind_hints_new RENAME TO mastermind_hints;', (err) => {
    if (err) {
      logger.error('Failed to rename mastermind_hints_new:', err.message);
      return;
    }
    logger.info('Renamed mastermind_hints_new to mastermind_hints.');
  });

  db.run('COMMIT;', (err) => {
    if (err) {
      logger.error('Failed to commit transaction:', err.message);
      return;
    }
    logger.info('Transaction committed.');
  });

  db.close((err) => {
    if (err) {
      logger.error('Failed to close the database:', err.message);
    } else {
      logger.info('Database connection closed.');
    }
  });
});
