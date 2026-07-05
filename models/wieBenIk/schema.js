//models/wieBenIk/schema.js
// Creates the "Wie ben ik" tables (lazily, like wordsService does for mastermind).
const db = require('../db');
const logger = require('../../logger');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS wbi_games (
      game_id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT NOT NULL,            -- 'theme_vote', 'question', 'voting', 'completed'
      status TEXT DEFAULT 'ongoing',  -- 'ongoing', 'completed'
      theme_id TEXT,
      theme_name TEXT,
      current_round INTEGER DEFAULT 0,
      winners TEXT DEFAULT '[]',      -- JSON array of winning user ids
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `, (err) => {
    if (err) logger.error('Failed to create wbi_games table:', err.message);
    else logger.info('wbi_games table created or already exists');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS wbi_players (
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      character_name TEXT,
      character_description TEXT,
      theme_vote TEXT,
      PRIMARY KEY (game_id, user_id),
      FOREIGN KEY (game_id) REFERENCES wbi_games(game_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) logger.error('Failed to create wbi_players table:', err.message);
    else logger.info('wbi_players table created or already exists');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS wbi_questions (
      question_id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      round_number INTEGER NOT NULL,
      text TEXT NOT NULL,
      is_guess INTEGER DEFAULT 0,
      llm_advice TEXT,                -- 'ja' or 'nee' suggestion from the LLM (guesses only)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES wbi_games(game_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) logger.error('Failed to create wbi_questions table:', err.message);
    else logger.info('wbi_questions table created or already exists');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS wbi_votes (
      vote_id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      answer TEXT NOT NULL,           -- 'ja', 'nee', '??'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (question_id, user_id),
      FOREIGN KEY (question_id) REFERENCES wbi_questions(question_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, (err) => {
    if (err) logger.error('Failed to create wbi_votes table:', err.message);
    else logger.info('wbi_votes table created or already exists');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS wbi_scores (
      score_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (game_id) REFERENCES wbi_games(game_id)
    )
  `, (err) => {
    if (err) logger.error('Failed to create wbi_scores table:', err.message);
    else logger.info('wbi_scores table created or already exists');
  });
});

module.exports = db;
