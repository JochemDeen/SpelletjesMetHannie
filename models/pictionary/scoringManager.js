//models/pictionary/scoringManager.js
const sqlite3 = require('sqlite3').verbose();
const logger = require('../../logger');
const db = require('../db'); 

// Define the scoring table at the top for easy adjustments
const scoringTable = {
    easy: [5, 3, 1, 0],
    medium: [10, 6, 3, 1, 0],
    hard: [20, 12, 6, 3, 0],
};

async function getMaxScore(difficulty) {
    const diff = difficulty.toLowerCase();
    if (!scoringTable[diff]) {
        throw new Error(`Invalid difficulty level: ${difficulty}`);
    }
    return scoringTable[diff][0];
}
    

async function getGameScore(gameId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT u.username, COALESCE(s.score, 0) AS score
             FROM users u
             LEFT JOIN scores s ON u.id = s.user_id AND s.game_id = ?
             WHERE u.id IN (
                 SELECT user_id FROM actions WHERE game_id = ?
                 UNION
                 SELECT drawer_user_id FROM games WHERE game_id = ?
             )
             ORDER BY score DESC`,
            [gameId, gameId, gameId],
            (err, rows) => {
                if (err) {
                    logger.error('Error fetching last game scores:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

async function getMonthlyScores(month) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT u.username, SUM(s.score) AS total_score 
             FROM scores s
             JOIN users u ON s.user_id = u.id
             WHERE strftime('%Y-%m', s.created_at) = ? 
             GROUP BY u.id
             ORDER BY total_score DESC`,
            [month],
            (err, rows) => {
                if (err) {
                    logger.error('Error fetching monthly scores:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}
async function getPreviousMonthWinner() {
    const previousMonth = new Date();
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    const monthStr = previousMonth.toISOString().slice(0, 7);

    return new Promise((resolve, reject) => {
        db.get(
            `SELECT u.username, MAX(s.score) AS score 
             FROM scores s
             JOIN users u ON s.user_id = u.id
             WHERE strftime('%Y-%m', s.created_at) = ?`,
            [monthStr],
            (err, row) => {
                if (err) {
                    logger.error('Error fetching previous month winner:', err.message);
                    reject(err);
                } else {
                    resolve(row ? { username: row.username, score: row.score } : null);
                }
            }
        );
    });
}
async function updateScoring(gameId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT game_id, drawer_user_id, current_round, difficulty, status FROM games WHERE game_id = ?`, 
            [gameId], 
            (err, game) => {
                if (err) {
                    logger.error('Error fetching game:', err.message);
                    return reject(err);
                }

                if (!game) {
                    logger.warn(`Game with ID ${gameId} not found.`);
                    return reject(new Error(`Game not found`));
                }

                if (game.status !== 'completed') {
                    logger.warn(`Game ${gameId} is not completed. Skipping scoring.`);
                    return resolve(false);
                }

                const { drawer_user_id, current_round, difficulty } = game;

                const difficultyLevel = difficulty.toLowerCase();
                if (!scoringTable[difficultyLevel]) {
                    logger.error(`Invalid difficulty level: ${difficulty}`);
                    return reject(new Error(`Invalid difficulty level`));
                }

                // Determine the points for this round
                let roundIndex = Math.min(current_round - 1, scoringTable[difficultyLevel].length - 1);
                let points = scoringTable[difficultyLevel][roundIndex];

                // Find users who guessed correctly (feedback == 5)
                db.all(
                    `SELECT DISTINCT user_id FROM actions WHERE game_id = ? AND feedback = 5 AND round_number = ?`,
                    [gameId, current_round],
                    (err, correctGuessers) => {
                        if (err) {
                            logger.error('Error fetching correct guessers:', err.message);
                            return reject(err);
                        }

                        // Prepare scoring inserts
                        let scoringEntries = [];
                        
                        // Add the drawer's score
                        scoringEntries.push([drawer_user_id, gameId, points]);

                        // Add scores for correct guessers
                        correctGuessers.forEach(({ user_id }) => {
                            scoringEntries.push([user_id, gameId, points]);
                        });

                        if (scoringEntries.length === 0) {
                            logger.info(`No scoring entries to insert for game ${gameId}`);
                            return resolve(true);
                        }

                        // Insert scores into the scores table
                        const insertQuery = `INSERT INTO scores (user_id, game_id, score) VALUES (?, ?, ?)`;
                        const insertPromises = scoringEntries.map(entry => {
                            return new Promise((res, rej) => {
                                db.run(insertQuery, entry, (err) => {
                                    if (err) {
                                        logger.error('Error inserting score:', err.message);
                                        rej(err);
                                    } else {
                                        res();
                                    }
                                });
                            });
                        });

                        // Wait for all inserts to complete
                        Promise.all(insertPromises)
                            .then(() => {
                                logger.info(`Scoring updated successfully for game ${gameId}`);
                                resolve(true);
                            })
                            .catch(reject);
                    }
                );
            }
        );
    });
}

async function handleEmptyDrawing(gameId) {
    return new Promise((resolve, reject) => {
      // Retrieve the game record to obtain the drawer and the list of guessers
      const gameSql = `SELECT game_id, drawer_user_id, guessers FROM games WHERE game_id = ?`;
      db.get(gameSql, [gameId], (err, game) => {
        if (err) {
          logger.error(`Failed to fetch game ${gameId}: ${err.message}`);
          return reject(err);
        }
        if (!game) {
          return reject(new Error(`Game with ID ${gameId} not found.`));
        }
  
        // Parse the guessers (stored as JSON in the database)
        let guessersArray = [];
        try {
          guessersArray = JSON.parse(game.guessers);
          if (!Array.isArray(guessersArray)) {
            guessersArray = [];
          }
        } catch (parseErr) {
          logger.warn(`Could not parse guessers for game ${gameId}: ${parseErr.message}`);
          guessersArray = [];
        }
  
        // Mark the game as ended (abandoned) by updating its state, status, and completed_at timestamp.
        const now = new Date().toISOString();
        const updateSql = `
          UPDATE games
          SET state = 'completed', status = 'abandoned', completed_at = ?
          WHERE game_id = ?
        `;
        db.run(updateSql, [now, gameId], function (updateErr) {
          if (updateErr) {
            logger.error(`Failed to update game ${gameId} as abandoned: ${updateErr.message}`);
            return reject(updateErr);
          }
          logger.info(`Game ${gameId} marked as abandoned due to an empty drawing.`);
  
          // Prepare scoring entries with 0 points for the drawer and all guessers.
          const scoringEntries = [];
          scoringEntries.push([game.drawer_user_id, gameId, 0]);
  
          // Remove duplicates from the guessers array.
          const uniqueGuessers = Array.from(new Set(guessersArray));
          uniqueGuessers.forEach(userId => {
            scoringEntries.push([userId, gameId, 0]);
          });
  
          if (scoringEntries.length === 0) {
            return resolve(true);
          }
  
          // Insert score records for each entry.
          const insertQuery = `INSERT INTO scores (user_id, game_id, score) VALUES (?, ?, ?)`;
          const insertPromises = scoringEntries.map(entry => {
            return new Promise((res, rej) => {
              db.run(insertQuery, entry, function (err) {
                if (err) {
                  logger.error(`Failed to insert score for user ${entry[0]} in game ${gameId}: ${err.message}`);
                  return rej(err);
                }
                res();
              });
            });
          });
  
          Promise.all(insertPromises)
            .then(() => {
              logger.info(`Empty drawing handled: All players in game ${gameId} receive 0 points.`);
              resolve(true);
            })
            .catch(insertErr => {
              logger.error(`Error inserting score entries for game ${gameId}: ${insertErr.message}`);
              reject(insertErr);
            });
        });
      });
    });
  }
  

module.exports = { 
    handleEmptyDrawing,
    updateScoring,
    getGameScore,
    getMonthlyScores,
    getPreviousMonthWinner,
    getMaxScore
};