// models/gameResults.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS mastermind_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guess TEXT NOT NULL,
        feedback TEXT NOT NULL,
        wordOfTheDay TEXT NOT NULL,
        timestamp TEXT NOT NULL
        )
    `);
  });
  
// Function to update user guess, store feedback, and word of the day
async function updateUserGuess(user_id, guess, feedback, wordOfTheDay) {
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO mastermind_results (user_id, guess, feedback, wordOfTheDay, timestamp) VALUES (?, ?, ?, ?, ?)',
        [user_id, guess, JSON.stringify(feedback), wordOfTheDay, new Date().toISOString()],
        (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
    });
  }


async function getUserGameState(user_id) {
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0];
      db.all('SELECT * FROM mastermind_results WHERE user_id = ? AND date(timestamp) = ?', [user_id, today], (err, rows) => {
        if (err) {
          return reject(err);
        }
        if (rows.length) {
          const guesses = rows.map(row => row.guess);
          const feedback = rows.map(row => JSON.parse(row.feedback));
          const success = feedback.some(feedbackArray => feedbackArray.every(entry => entry === 'correct'));
          resolve({ guesses, feedback, success, currentRow: rows.length });
        } else {
          resolve(null);
        }
      });
    });
  }

  module.exports = {
    updateUserGuess,
    getUserGameState,
  };
  