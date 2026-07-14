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


  async function getUserGameState(user_id, date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM mastermind_results WHERE user_id = ? AND date(timestamp) = ?', [user_id, targetDate], (err, rows) => {
        if (err) {
          return reject(err);
        }
        if (rows.length) {
          const guesses = rows.map(row => row.guess);
          const feedback = rows.map(row => JSON.parse(row.feedback));
          const success = feedback.some(feedbackArray => feedbackArray.every(entry => entry === 'correct'));
          const finished = guesses.length >= 6 || success;
          resolve({ guesses, feedback, success, currentRow: rows.length, finished });
        } else {
          resolve(null);
        }
      });
    });
  }
  
 
async function getAllResults(user_id, date) {
  logger.info(`Retrieving all results for user ${user_id}`);
  const targetDate = date || new Date().toISOString().split('T')[0];

  
  return new Promise((resolve, reject) => {
    // First, check if the user has a correct guess or has made 6 guesses at targetDate
    db.get(
      `SELECT * FROM mastermind_results 
       WHERE user_id = ? 
       AND (feedback LIKE ? OR 
            (SELECT COUNT(*) FROM mastermind_results 
             WHERE user_id = ? AND date(timestamp) = ?) >= 6) 
       AND date(timestamp) = ?`, 
      [user_id, '%correct%', user_id, targetDate, targetDate], 
      (err, row) => {
        if (err) {
          return reject(err);
        }
        if (row) {
          logger.info(`User ${user_id} met the criteria at ${targetDate}. Retrieving all results.`);

          // Retrieve all results for users who solved the puzzle or made 6 guesses at targetDate
          db.all(
            `SELECT * FROM mastermind_results 
             WHERE date(timestamp) = ? 
             AND (feedback LIKE '%correct%' OR 
                  (SELECT COUNT(*) FROM mastermind_results 
                   WHERE user_id = mastermind_results.user_id 
                   AND date(timestamp) = ?) >= 6)`,
            [targetDate, targetDate],
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
                      success: false,  // Track if the user was successful
                      score: 0         // Initialize score for the user
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

                // Calculate the score for each user based on their guesses
                // resultsMap.forEach(userResult => {
                //   userResult.score = calculateScore(userResult.guesses);  // Use existing calculateScore function
                // });
                resultsMap.forEach(userResult => {
                  userResult.score = calculateScore(userResult.guesses, userResult.success);
                });

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

                logger.info(`Retrieved ${results.length} results for ${targetDate}, with scores included.`);

                resolve(results);
              } else {
                logger.info(`No users met the criteria ${targetDate}.`);
                resolve([]);
              }
            }
          );
        } else {
          // User hasn't met either criterion, return empty
          logger.info(`User ${user_id} hasn't met the criteria ${targetDate}.`);
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
      let correctGames = 0;
      let percentCorrect = 0;

      // Calculate total score for all guesses and for the current month
      const currentMonth = new Date().toISOString().split('T')[0].slice(0, 7); // "YYYY-MM"
      let totalScore = 0;
      let monthlyScore = 0;

      const gamesByDate = rows.reduce((acc, row) => {
        const date = row.timestamp.split('T')[0];
        if (!acc[date]) acc[date] = [];
        acc[date].push(row);
        return acc;
      }, {});

      const gameResultsByDate = [];

      Object.entries(gamesByDate).forEach(([date, gameRows]) => {
        const guesses = gameRows.map(row => row.guess);
        const success = gameRows.some(row => JSON.parse(row.feedback).every(entry => entry === 'correct'));
        const dailyScore = calculateScore(guesses, success);
        totalScore += dailyScore;

        // Add to monthly score if within current month
        if (date.startsWith(currentMonth)) {
          monthlyScore += dailyScore;
        }

        gameResultsByDate.push({ date, success });

        // Update correctGames
        if (success) {
          correctGames++;
        }
      });

      // Update percentCorrect
      percentCorrect = totalGames > 0 ? ((correctGames / totalGames) * 100).toFixed(2) : 0;

      // Sort gameResultsByDate
      gameResultsByDate.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Calculate streaks
      let currentStreak = 0;
      let maxStreak = 0;
      let streak = 0;
      let previousDate = null;

      for (let i = 0; i < gameResultsByDate.length; i++) {
        const { date, success } = gameResultsByDate[i];

        if (success) {
          if (previousDate) {
            const difference = new Date(date) - previousDate;
            if (difference === 86400000) { // 1 day in milliseconds
              streak++;
            } else {
              streak = 1;
            }
          } else {
            streak = 1;
          }
          previousDate = new Date(date);
          maxStreak = Math.max(maxStreak, streak);
        } else {
          // Reset streak on a loss
          streak = 0;
          previousDate = null;
        }

        // For current streak, if we are at the last date, set currentStreak
        if (i === gameResultsByDate.length - 1) {
          if (success) {
            currentStreak = streak;
          } else {
            currentStreak = 0;
          }
        }
      }

      // Calculate guess distribution
      const guessDistribution = Array(7).fill(0); // Index 0-6, index 0 unused

      Object.entries(gamesByDate).forEach(([date, gameRows]) => {
        const success = gameRows.some(row => JSON.parse(row.feedback).every(entry => entry === 'correct'));
        if (success) {
          const numGuesses = gameRows.length;
          if (numGuesses <= 6) {
            guessDistribution[numGuesses]++;
          } else {
            guessDistribution[6]++;
          }
        }
      });

      // Calculate medianGuess
      const guessCounts = [];
      Object.values(gamesByDate).forEach(gameRows => {
        const success = gameRows.some(row => JSON.parse(row.feedback).every(entry => entry === 'correct'));
        if (success) {
          const numGuesses = gameRows.length;
          guessCounts.push(numGuesses);
        }
      });

      guessCounts.sort((a, b) => a - b);
      const midIndex = Math.floor(guessCounts.length / 2);
      const medianGuess = guessCounts.length % 2 !== 0
        ? guessCounts[midIndex]
        : (guessCounts[midIndex - 1] + guessCounts[midIndex]) / 2;

      // Calculate additional statistics
      let latestGuessIndex = null;
      if (rows.length) {
        const latestGameDate = rows[rows.length - 1].timestamp.split('T')[0];
        latestGuessIndex = rows.filter(row => row.timestamp.split('T')[0] === latestGameDate).length;
      }

      const latestGuessTime = rows.length ? rows[rows.length - 1].timestamp : null;
      const averageGuess = totalGames > 0 ? (rows.length / totalGames).toFixed(2) : 0;
      
      logger.info(`User ${user_id} statistics - Total Games: ${totalGames}, Correct Games: ${correctGames}, Percent Correct: ${percentCorrect}, Total Score: ${totalScore}, Monthly Score: ${monthlyScore}`);

      resolve({
        totalGames,
        percentCorrect,
        currentStreak,
        maxStreak,
        guessDistribution,
        averageGuess,
        medianGuess,
        latestGuessTime,
        latestGuessIndex,
        totalScore,       // Total score from all games
        monthlyScore      // Score for the current month
      });
    });
  });
}

// Function to get monthly scores
async function getMonthlyScores(month) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT u.username,
            strftime('%Y-%m', r.timestamp) AS month,
            strftime('%Y-%m-%d', r.timestamp) AS day,
            GROUP_CONCAT(r.guess, '|~|') AS guesses,
            GROUP_CONCAT(r.feedback, '|~|') AS feedbacks
      FROM mastermind_results AS r
      JOIN users AS u ON r.user_id = u.id
      WHERE strftime('%Y-%m', r.timestamp) = ?
      GROUP BY u.username, month, day
      ORDER BY month DESC
    `, [month], (err, rows) => {
      if (err) return reject(err);

      // Existing code to calculate scores
      const monthlyScores = {};

      rows.forEach(row => {
        const guesses = row.guesses.split('|~|');
        const feedbacks = row.feedbacks.split('|~|').map(feedback => JSON.parse(feedback));
        const success = feedbacks.some(feedbackArray => feedbackArray.every(entry => entry === 'correct'));
        const dailyScore = calculateScore(guesses, success);

        const key = `${row.username}-${row.month}`;
        if (!monthlyScores[key]) {
          monthlyScores[key] = { username: row.username, month: row.month, score: 0 };
        }
        monthlyScores[key].score += dailyScore;
      });

      const scores = Object.values(monthlyScores);
      logger.info(`Retrieved monthly scores for ${scores.length} users for month ${month}.`);
      resolve(scores);
    });
  });
}




// Function to get the highest scorer per month
async function getHighestScorerCounts() {
  return new Promise((resolve, reject) => {
      db.all(`
          SELECT u.username, strftime('%Y-%m', r.timestamp) AS month, strftime('%Y-%m-%d', r.timestamp) AS day,
                 GROUP_CONCAT(r.guess, '|~|') AS guesses, GROUP_CONCAT(r.feedback, '|~|') AS feedbacks
          FROM mastermind_results AS r
          JOIN users AS u ON r.user_id = u.id
          GROUP BY u.username, month, day
          ORDER BY month DESC
      `, (err, rows) => {
          if (err) return reject(err);

          const currentMonth = new Date().toISOString().slice(0, 7); // Get current month in "YYYY-MM" format
          const monthlyScores = {};  // { month: { username: score } }
          const userMonthlyScores = {};  // For tracking each user's score per month

          // Step 1: Calculate daily scores and aggregate them into monthly scores, excluding the current month
          rows.forEach(row => {
              if (row.month === currentMonth) return; // Skip the current month

              const guesses = row.guesses.split('|~|');  // Convert guesses to array
              //const dailyScore = calculateScore(guesses);  // Calculate score based on daily guesses
              const feedbacks = row.feedbacks.split('|~|').map(feedback => {
                try {
                  return JSON.parse(feedback);
                } catch (e) {
                  logger.error('Failed to parse feedback JSON:', e);
                  return null; // or handle the error as needed
                }
              }).filter(feedback => feedback !== null);
              const success = feedbacks.some(feedbackArray => feedbackArray.every(entry => entry === 'correct'));
              const dailyScore = calculateScore(guesses, success);
              const key = `${row.username}-${row.month}`;

              // Sum daily scores for each month and user
              if (!userMonthlyScores[key]) {
                  userMonthlyScores[key] = { username: row.username, month: row.month, score: 0 };
              }
              userMonthlyScores[key].score += dailyScore;

              // Track total scores per user per month
              if (!monthlyScores[row.month]) {
                  monthlyScores[row.month] = [];
              }
          });

          // Step 2: Prepare monthlyScores as array of { month: { username: score } }
          Object.values(userMonthlyScores).forEach(({ username, month, score }) => {
              if (!monthlyScores[month]) {
                  monthlyScores[month] = [];
              }
              monthlyScores[month].push({ username, score });
          });

          // Step 3: Determine highest scorer counts
          const highestScorerCounts = {};

          for (const [month, users] of Object.entries(monthlyScores)) {
              // Find the max score for this month
              const maxScore = Math.max(...users.map(user => user.score));

              // Increment count for each user with the max score in this month
              users.forEach(user => {
                  if (user.score === maxScore) {
                      if (!highestScorerCounts[user.username]) {
                          highestScorerCounts[user.username] = 0;
                      }
                      highestScorerCounts[user.username] += 1;
                  }
              });
          }

          // Format results
          db.all("SELECT username FROM users", (err, allUsers) => {
              if (err) return reject(err);

              const result = allUsers.map(row => ({
                  username: row.username,
                  highestCount: highestScorerCounts[row.username] || 0
              }));
              logger.info(`Retrieved highest scorer counts for ${result.length} users.`);
              resolve(result);
          });
      });
  });
}


// Function to get the top N highest monthly scores ever achieved (across all users/months)
async function getTopMonthlyScores(limit = 3) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT u.username,
            strftime('%Y-%m', r.timestamp) AS month,
            strftime('%Y-%m-%d', r.timestamp) AS day,
            GROUP_CONCAT(r.guess, '|~|') AS guesses,
            GROUP_CONCAT(r.feedback, '|~|') AS feedbacks
      FROM mastermind_results AS r
      JOIN users AS u ON r.user_id = u.id
      GROUP BY u.username, month, day
    `, (err, rows) => {
      if (err) return reject(err);

      const monthlyScores = {}; // key: `${username}-${month}` -> { username, month, score }

      rows.forEach(row => {
        const guesses = row.guesses.split('|~|');
        const feedbacks = row.feedbacks.split('|~|').map(feedback => {
          try {
            return JSON.parse(feedback);
          } catch (e) {
            logger.error('Failed to parse feedback JSON:', e);
            return null;
          }
        }).filter(feedback => feedback !== null);
        const success = feedbacks.some(feedbackArray => feedbackArray.every(entry => entry === 'correct'));
        const dailyScore = calculateScore(guesses, success);

        const key = `${row.username}-${row.month}`;
        if (!monthlyScores[key]) {
          monthlyScores[key] = { username: row.username, month: row.month, score: 0 };
        }
        monthlyScores[key].score += dailyScore;
      });

      const topScores = Object.values(monthlyScores)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      logger.info(`Retrieved top ${topScores.length} monthly scores.`);
      resolve(topScores);
    });
  });
}

// Function to calculate score based on the number of guesses
function calculateScore(guesses, success) {
  if (!success) return 0;  // No score if the user didn't guess the word
  const length = guesses.length;
  switch (length) {
    case 6: return 1;
    case 5: return 2;
    case 4: return 3;
    case 3: return 4;
    case 2: return 6;
    case 1: return 8;
    default: return 0;  // In case there are more than 6 guesses
  }
}
/**
 * Fetch the earliest date from the results table
 * @returns {Promise<string>} Earliest date in YYYY-MM-DD format
 */
async function getEarliestDate() {
  return new Promise((resolve, reject) => {
      db.get(
          `SELECT MIN(date(timestamp)) as earliestDate FROM mastermind_results`,
          (err, row) => {
              if (err) {
                  return reject(err);
              }
              resolve(row?.earliestDate || null);
          }
      );
  });
}



  
  module.exports = {
    updateUserGuess,
    getUserGameState,
    getAllResults,
    getUserStats,
    getMonthlyScores,
    getHighestScorerCounts,
    getTopMonthlyScores,
    calculateScore,
    getEarliestDate
  };
