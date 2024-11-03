// models/gameResults.js
const sqlite3 = require('sqlite3').verbose();
const logger = require('../logger');  

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
          logger.info(`Successfully updated guess for user ${user_id}`);

          resolve();
        });
    });
  }


async function getUserGameState(user_id) {
  logger.info(`Retrieving game state for user ${user_id}`);
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0];
    db.all('SELECT * FROM mastermind_results WHERE user_id = ? AND date(timestamp) = ?', [user_id, today], (err, rows) => {
      if (err) {
        return reject(err);
      }
      if (rows.length) {
        logger.info(`Game state found for user ${user_id}`);
        const guesses = rows.map(row => row.guess);
        const feedback = rows.map(row => JSON.parse(row.feedback));
        const success = feedback.some(feedbackArray => feedbackArray.every(entry => entry === 'correct'));
        const finished = guesses.length >= 6 || success;
        resolve({ guesses, feedback, success, currentRow: rows.length, finished });
      } else {
        logger.info(`No game state found for user ${user_id}`);
        resolve(null);
      }
    });
  });
}
 
async function getAllResults(user_id) {
  logger.info(`Retrieving all results for user ${user_id}`);
  const today = new Date().toISOString().split('T')[0];
  return new Promise((resolve, reject) => {
    // First, check if the user has a correct guess or has made 6 guesses today
    db.get(
      `SELECT * FROM mastermind_results 
       WHERE user_id = ? 
       AND (feedback LIKE ? OR 
            (SELECT COUNT(*) FROM mastermind_results 
             WHERE user_id = ? AND date(timestamp) = ?) >= 6) 
       AND date(timestamp) = ?`, 
      [user_id, '%correct%', user_id, today, today], 
      (err, row) => {
        if (err) {
          return reject(err);
        }
        if (row) {
          logger.info(`User ${user_id} met the criteria today. Retrieving all results.`);

          // Retrieve all results for users who solved the puzzle or made 6 guesses today
          db.all(
            `SELECT * FROM mastermind_results 
             WHERE date(timestamp) = ? 
             AND (feedback LIKE '%correct%' OR 
                  (SELECT COUNT(*) FROM mastermind_results 
                   WHERE user_id = mastermind_results.user_id 
                   AND date(timestamp) = ?) >= 6)`,
            [today, today],
            async (err, rows) => {
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
                      solveTime: null,
                      username,
                      guesses: [],
                      feedback: [],
                      success: false  // Track if the user was successful
                    });
                  }
                  const userResult = resultsMap.get(username);
                  userResult.guesses.push(row.guess);
                  userResult.feedback.push(JSON.parse(row.feedback));

                  // Update solveTime to the latest timestamp when the user correctly solved it
                  if (JSON.parse(row.feedback).every(entry => entry === 'correct')) {
                    userResult.solveTime = row.timestamp;
                    userResult.success = true;  // Mark as successful if solved correctly
                  }
                }

                // Filter out users who haven't completed the puzzle or haven't made 6 guesses
                const results = Array.from(resultsMap.values()).filter(result => 
                  result.success || result.guesses.length >= 6
                );
                
                // Mark users with 6 guesses but no correct feedback as unsuccessful
                results.forEach(result => {
                  if (!result.success && result.guesses.length >= 6) {
                    result.success = false;
                  }
                });

                logger.info(`Retrieved ${results.length} results for today.`);

                resolve(results);
              } else {
                logger.info(`No users met the criteria today.`);
                resolve([]);
              }
            }
          );
        } else {
          // User hasn't met either criterion, return empty
          logger.info(`User ${user_id} hasn't met the criteria today.`);
          resolve([]);
        }
      }
    );
  });
}

// Function to get statistics for a user
async function getUserStats(user_id) {
  logger.info(`Retrieving statistics for user ${user_id}`);

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
        logger.info(`User ${user_id} statistics - Total Games: ${totalGames}, Correct Games: ${correctGames}, Percent Correct: ${percentCorrect}`);

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
