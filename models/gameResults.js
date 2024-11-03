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
 
 // Function to get all results for the stats page if the user has solved the puzzle today
async function getAllResults(user_id) {
    const today = new Date().toISOString().split('T')[0];
    return new Promise((resolve, reject) => {
      // First, check if the user has a correct guess for today
      db.get('SELECT * FROM mastermind_results WHERE user_id = ? AND feedback LIKE ? AND date(timestamp) = ?', [user_id, '%correct%', today], (err, row) => {
        if (err) {
          return reject(err);
        }
        if (row) {
          // If the user has solved it, retrieve all results for today
          db.all('SELECT * FROM mastermind_results WHERE date(timestamp) = ?', [today], async (err, rows) => {
            if (err) {
              return reject(err);
            }
            if (rows.length) {
              const userDb = require('./user');
              const resultsMap = new Map();
  
              for (const row of rows) {
                const username = await userDb.getUsernameById(row.user_id);
                if (!resultsMap.has(username)) {
                  resultsMap.set(username, {
                    solveTime: row.timestamp,
                    username,
                    guesses: [],
                    feedback: []
                  });
                }
                const userResult = resultsMap.get(username);
                userResult.guesses.push(row.guess);
                userResult.feedback.push(JSON.parse(row.feedback));
                // Update solveTime to the latest timestamp when the user correctly solved it
                if (JSON.parse(row.feedback).every(entry => entry === 'correct')) {
                  userResult.solveTime = row.timestamp;
                }
              }
  
              // Filter out users who haven't completed the puzzle (i.e., no 'correct' feedback)
              const results = Array.from(resultsMap.values()).filter(result => 
                result.feedback.some(feedbackArray => feedbackArray.every(entry => entry === 'correct'))
              );
  
              resolve(results);
            } else {
              resolve([]);
            }
          });
        } else {
          // User hasn't solved the puzzle today, return empty
          resolve([]);
        }
      });
    });
  }

// Function to get statistics for a user
async function getUserStats(user_id) {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM mastermind_results WHERE user_id = ?', [user_id], (err, rows) => {
        if (err) {
          return reject(err);
        }
  
        const totalGames = new Set(rows.map(row => row.timestamp.split('T')[0])).size;
        const correctGames = rows.filter(row => JSON.parse(row.feedback).every(entry => entry === 'correct')).length;
        const percentCorrect = totalGames > 0 ? ((correctGames / totalGames) * 100).toFixed(2) : 0;
  
        // Calculate streaks
        const dates = [...new Set(rows.map(row => row.timestamp.split('T')[0]))].sort();
        let currentStreak = 0;
        let maxStreak = 0;
        let streak = 0;
        let previousDate = null;
  
        for (const date of dates) {
          if (previousDate) {
            const difference = new Date(date) - new Date(previousDate);
            if (difference === 86400000) { // 1 day in milliseconds
              streak++;
            } else {
              streak = 1;
            }
          } else {
            streak = 1;
          }
          previousDate = date;
          maxStreak = Math.max(maxStreak, streak);
          currentStreak = streak;
        }
  
        // Calculate guess distribution
        const guessDistribution = Array(7).fill(0); // Index 1-6, index 0 unused
        rows.forEach(row => {
          if (JSON.parse(row.feedback).every(entry => entry === 'correct')) {
            const gameGuesses = rows.filter(r => r.timestamp.split('T')[0] === row.timestamp.split('T')[0]).length;
            if (gameGuesses <= 6) {
              guessDistribution[gameGuesses]++;
            }
          }
        });

        let latestGuessIndex = null;
        if (rows.length) {
          const latestGameDate = rows[rows.length - 1].timestamp.split('T')[0];
          latestGuessIndex = rows.filter(row => row.timestamp.split('T')[0] === latestGameDate).length;
        }

  
        const latestGuessTime = rows.length ? rows[rows.length - 1].timestamp : null;
        const averageGuess = totalGames > 0 ? (rows.length / totalGames).toFixed(2) : 0;
        const medianGuess = guessDistribution.reduce((a, b) => a + b, 0) / 2;
  
        resolve({
          totalGames,
          percentCorrect,
          currentStreak,
          maxStreak,
          guessDistribution,
          averageGuess,
          medianGuess,
          latestGuessTime,
          latestGuessIndex
        });
      });
    });
  }
  
  module.exports = {
    updateUserGuess,
    getUserGameState,
    getAllResults,
    getUserStats,
  };
