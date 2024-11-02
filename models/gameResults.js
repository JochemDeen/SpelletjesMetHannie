// models/gameResults.js

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

// Create the mastermind_results table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS mastermind_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date_played DATE NOT NULL,
      target_word TEXT NOT NULL,
      guesses TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      success BOOLEAN NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
});

module.exports = db;

function saveGameResult(gameResult, callback) {
    const { user_id, date_played, target_word, guesses, attempts, success } = gameResult;
  
    const sql = `
      INSERT INTO mastermind_results (user_id, date_played, target_word, guesses, attempts, success)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
  
    db.run(sql, [user_id, date_played, target_word, guesses, attempts, success], function (err) {
      if (err) {
        return callback(err);
      }
      callback(null, this.lastID);
    });
  }
  
  function getGameResultsByUser(user_id, callback) {
    const sql = `
      SELECT * FROM mastermind_results
      WHERE user_id = ?
      ORDER BY date_played DESC
    `;
  
    db.all(sql, [user_id], (err, rows) => {
      if (err) {
        return callback(err);
      }
      callback(null, rows);
    });
  }
  
  module.exports = {
    db,
    saveGameResult,
    getGameResultsByUser
  };
  