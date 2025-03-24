//models/db.js
const sqlite3 = require('sqlite3').verbose();
const logger = require('../logger');

const db = new sqlite3.Database('database.sqlite', (err) => {
  if (err) {
    logger.error('Failed to connect to the database:', err.message);
  } else {
    logger.info('Connected to the SQLite database');
  }
});

// Ensure tables exist
db.serialize(() => {
  // Create the games table if it doesn't exist
  db.run(`
      CREATE TABLE IF NOT EXISTS games (
        game_id INTEGER PRIMARY KEY AUTOINCREMENT,
        drawer_user_id INTEGER NOT NULL,
        image_path TEXT,
        word TEXT,
        current_round INTEGER DEFAULT 1,
        current_words TEXT DEFAULT '[]',
        state TEXT NOT NULL,          -- Possible values: 'choose', 'drawing', 'guessing', 'feedback', 'completed'
        status TEXT DEFAULT 'ongoing',-- 'ongoing', 'completed', 'abandoned'
        difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'easy',
        countdown_seconds INTEGER DEFAULT 60,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        drawing_completed_at DATETIME,
        completed_at, DATETIME,
        guessers TEXT NOT NULL,
        FOREIGN KEY (drawer_user_id) REFERENCES users(id)
      )
  `, (err) => {
    if (err) {
      logger.error('Failed to create games table:', err.message);
    } else {
      logger.info('Games table created or already exists');
    }
  });

  // Create the actions table if it doesn't exist
  db.run(`
      CREATE TABLE IF NOT EXISTS actions (
        action_id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,          -- 'guess' or other actions
        round_number INTEGER NOT NULL,
        content TEXT,                  -- The guessed word
        feedback INTEGER DEFAULT NULL, -- NULL = no feedback, 5 = correct
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(game_id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
  `, (err) => {
    if (err) {
      logger.error('Failed to create actions table:', err.message);
    } else {
      logger.info('Actions table created or already exists');
    }
  });

  // Create the scores table if it doesn't exist
  db.run(`
      CREATE TABLE IF NOT EXISTS scores (
        score_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        game_id INTEGER NOT NULL,
        score INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (game_id) REFERENCES games(game_id)
      )
  `, (err) => {
    if (err) {
      logger.error('Failed to create scores table:', err.message);
    } else {
      logger.info('Scores table created or already exists');
    }
  });
 
  // Create the users table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      passwordHash TEXT
    )
  `, (err) => {
    if (err) {
      logger.error('Failed to create users table:', err.message);
    } else {
      logger.info('Users table created or already exists');
    }
  });

  // Create a settings table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER,
      setting_key TEXT,
      setting_value TEXT,
      PRIMARY KEY (user_id, setting_key),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      logger.error('Failed to create settings table:', err.message);
    } else {
      logger.info('Settings table created or already exists');
    }
  });

  // Create tables if they don't exist
    // Create user word ratings table
    db.run(`
      CREATE TABLE IF NOT EXISTS pictionary_word_ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        word TEXT NOT NULL,
        word_id TEXT,
        rating TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, err => {
      if (err) {
        logger.error('Failed to create word ratings table:', err.message);
      }else{
        logger.info('Word ratings table created or already exists ');
      }
      
      // Create word suggestions table
      db.run(`
        CREATE TABLE IF NOT EXISTS pictionary_word_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          word TEXT NOT NULL,
          difficulty TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          used_count INTEGER DEFAULT 0,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `, err => {
        if (err) {
          logger.error('Failed to create word suggestions table:', err.message);
        }
        else {
          logger.info('Word suggestions table created or already exists');
        }
      });
    });

});

module.exports = db;