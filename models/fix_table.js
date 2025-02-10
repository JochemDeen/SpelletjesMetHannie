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
  db.run('PRAGMA foreign_keys=OFF;', (err) => {
    if (err) {
      logger.error('Failed to disable foreign key constraints:', err.message);
      return;
    }
    logger.info('Foreign key constraints disabled.');
  });

  db.run('BEGIN TRANSACTION;', (err) => {
    if (err) {
      logger.error('Failed to begin transaction:', err.message);
      return;
    }
    logger.info('Transaction started.');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS games_new (
      game_id INTEGER PRIMARY KEY AUTOINCREMENT,
      drawer_user_id INTEGER NOT NULL,
      image_path TEXT,
      word TEXT,
      current_round INTEGER DEFAULT 1,
      current_words TEXT DEFAULT '[]',
      state TEXT NOT NULL,       
      status TEXT DEFAULT 'ongoing',
      difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'easy',
      countdown_seconds INTEGER DEFAULT 60,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      drawing_completed_at DATETIME,  -- Renamed column
      completed_at DATETIME,  -- New empty column
      guessers TEXT NOT NULL,
      FOREIGN KEY (drawer_user_id) REFERENCES users(id)
    );
  `, (err) => {
    if (err) {
      logger.error('Failed to create new games table:', err.message);
      return;
    }
    logger.info('New games table created.');
  });

  db.run(`
    INSERT INTO games_new (
      game_id, drawer_user_id, image_path, word, current_round, current_words,
      state, status, difficulty, countdown_seconds, created_at, drawing_completed_at, guessers
    )
    SELECT 
      game_id, drawer_user_id, image_path, word, current_round, current_words,
      state, status, difficulty, countdown_seconds, created_at, completed_at, guessers
    FROM games;
  `, (err) => {
    if (err) {
      logger.error('Failed to copy data to new table:', err.message);
      return;
    }
    logger.info('Data copied to new table successfully.');
  });

  db.run('DROP TABLE games;', (err) => {
    if (err) {
      logger.error('Failed to drop old games table:', err.message);
      return;
    }
    logger.info('Old games table dropped.');
  });

  db.run('ALTER TABLE games_new RENAME TO games;', (err) => {
    if (err) {
      logger.error('Failed to rename new table:', err.message);
      return;
    }
    logger.info('Renamed new table to games.');
  });

    // Update the latest game's completed_at column to the current timestamp
    db.run(`
        UPDATE games 
        SET completed_at = datetime('now') 
        WHERE game_id = (SELECT game_id FROM games ORDER BY created_at DESC LIMIT 1);
      `, (err) => {
        if (err) {
          logger.error('Failed to update latest game completed_at:', err.message);
          return;
        }
        logger.info('Latest game updated with current timestamp in completed_at.');
      });
    

  db.run('COMMIT;', (err) => {
    if (err) {
      logger.error('Failed to commit transaction:', err.message);
      return;
    }
    logger.info('Transaction committed.');
  });

  db.run('PRAGMA foreign_keys=ON;', (err) => {
    if (err) {
      logger.error('Failed to re-enable foreign key constraints:', err.message);
      return;
    }
    logger.info('Foreign key constraints re-enabled.');
  });

  db.close((err) => {
    if (err) {
      logger.error('Failed to close the database:', err.message);
    } else {
      logger.info('Database connection closed.');
    }
  });
});