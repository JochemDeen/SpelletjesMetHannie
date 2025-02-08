//models/pictionary/gameManager.js
const sqlite3 = require('sqlite3').verbose();
const { log } = require('winston');
const logger = require('../../logger');
const db = require('../db'); 

// Returns the current global active game (if any), ignoring the current user.
async function getActiveGame() {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT g.*, u.username AS drawer_name
            FROM games g
            JOIN users u ON g.drawer_user_id = u.id
            WHERE g.status = 'ongoing'
            ORDER BY created_at DESC
            LIMIT 1
        `;
        db.get(sql, [], async (err, row) => {
            if (err) {
                logger.error('Failed to fetch active game:', err.message);
                return reject(err);
            }

            if (row) {
                return resolve(row);
            }

            // If no active game, check if the last completed game was less than 24 hours ago
            const lastCompletedGameSql = `
                SELECT game_id, completed_at 
                FROM games 
                WHERE status = 'completed' 
                ORDER BY completed_at DESC 
                LIMIT 1
            `;
            db.get(lastCompletedGameSql, [], (err, lastGame) => {
                if (err) {
                    logger.error('Failed to fetch last completed game:', err.message);
                    return reject(err);
                }

                if (lastGame) {
                    const completedAt = new Date(lastGame.completed_at);
                    const now = new Date();
                    const diffHours = (now - completedAt) / (1000 * 60 * 60); // Convert ms to hours

                    if (diffHours < 24) {
                        logger.info(`Last game ended ${diffHours.toFixed(2)} hours ago. Returning "scoring" state.`);
                        return resolve({ game_id: lastGame.game_id, state: 'scoring', status: 'completed' });
                    }
                }

                // No active game and no recent completed game, return null
                resolve(null);
            });
        });
    });
}
  
  // Creates a new game using all active users.
  // Uses your "next user" logic based on the last finished game.
  async function createNewGame(activeUsers) {
    return new Promise((resolve, reject) => {
        const lastGameSql = `
            SELECT drawer_user_id, countdown_seconds, current_round
            FROM games 
            WHERE status = 'completed' AND image_path IS NOT NULL
            ORDER BY created_at DESC LIMIT 1
        `;
        
        db.get(lastGameSql, [], (lastErr, lastRow) => {
            if (lastErr) {
                logger.error('Failed to fetch last finished game:', lastErr.message);
                return reject(lastErr);
            }
            
            activeUsers.sort((a, b) => a - b);
            let nextDrawerUserId;
            if (lastRow) {
                const lastDrawer = lastRow.drawer_user_id;
                const index = activeUsers.indexOf(lastDrawer);
                nextDrawerUserId = (index >= 0 && index < activeUsers.length - 1)
                    ? activeUsers[index + 1]
                    : activeUsers[0];
            } else {
                nextDrawerUserId = activeUsers[0];
            }
            
            const guessers = JSON.stringify(activeUsers.filter(id => id !== nextDrawerUserId));
            
            // Determine the countdown adjustment
            let newCountdown = 60; // Default countdown if no previous game
            if (lastRow && lastRow.drawer_user_id === nextDrawerUserId) {
                newCountdown = lastRow.countdown_seconds;
                if (lastRow.current_round === 1 && newCountdown > 5) {
                    newCountdown = Math.max(5, newCountdown - 5);
                } else if (lastRow.current_round > 4 && newCountdown < 180) {
                    newCountdown = Math.min(180, newCountdown + 5);
                }
            }
            
            logger.info(`Next drawer determined as: ${nextDrawerUserId}`);
            logger.info(`Guessers list: ${guessers}`);
            logger.info(`Countdown set to: ${newCountdown} seconds`);
            
            const insertSql = `
                INSERT INTO games (drawer_user_id, state, status, guessers, countdown_seconds)
                VALUES (?, 'choose', 'ongoing', ?, ?)
            `;
            
            db.run(insertSql, [nextDrawerUserId, guessers, newCountdown], function (insertErr) {
                if (insertErr) {
                    logger.error('Failed to create a new game:', insertErr.message);
                    return reject(insertErr);
                }
                
                logger.info(`New game created with game_id: ${this.lastID}, drawer_user_id: ${nextDrawerUserId}, countdown: ${newCountdown} sec`);
                resolve(this.lastID);
            });
        });
    });
}  
  // Fetch a game by its game_id.
  async function getGameById(gameId) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT g.*, u.username AS drawer_name
            FROM games g
            JOIN users u ON g.drawer_user_id = u.id
            WHERE g.game_id = ?
        `;
        db.get(sql, [gameId], (err, row) => {
            if (err) {
                logger.error(`Failed to fetch game with ID ${gameId}:`, err.message);
                return reject(err);
            }
            resolve(row); // Returns null if no game is found
        });
    });
}

// Retrieves the game state for a given user.
async function getGameState(userId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT g.*, u.username AS drawer_name
      FROM games g
      JOIN users u ON g.drawer_user_id = u.id
      WHERE g.status = 'ongoing' AND (g.drawer_user_id = ? OR g.guessers LIKE ?)
    `;
    const guesserSearch = `%${userId}%`;
    logger.info(`Fetching game state for user ${userId} with guesserSearch: ${guesserSearch}`);
    db.get(sql, [userId, guesserSearch], (err, row) => {
      if (err) {
        logger.error('Failed to fetch game state:', err.message);
        return reject(err);
      }
      if (!row) {
        logger.info(`No active game found for user ${userId}`);
        return resolve(null);
      }
      resolve(row);
    });
  });
}

async function checkForEndOfGuessing(gameId) {
    return new Promise((resolve, reject) => {
        const gameSql = `SELECT guessers, current_round FROM games WHERE game_id = ?`;
        db.get(gameSql, [gameId], (err, game) => {
            if (err) return reject(err);
            if (!game) return resolve(false);

            const guessers = JSON.parse(game.guessers);
            const currentRound = game.current_round;

            if (!Array.isArray(guessers) || guessers.length === 0) return resolve(false);

            const guessSql = `
                SELECT COUNT(DISTINCT user_id) AS guessCount
                FROM actions
                WHERE game_id = ? AND round_number = ? AND action = 'guess'
            `;
            db.get(guessSql, [gameId, currentRound], (err, result) => {
                if (err) return reject(err);
                
                if (result.guessCount === guessers.length) {
                    // Update state to "feedback"
                    db.run(`UPDATE games SET state = 'feedback' WHERE game_id = ?`, [gameId], (err) => {
                        if (err) return reject(err);
                        logger.info(`Game ${gameId} moved to feedback phase.`);
                        resolve(true);
                    });
                } else {
                    resolve(false);
                }
            });
        });
    });
}

async function setGameState(gameId, state) {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE games SET state = ? WHERE game_id = ?`;
        db.run(sql, [state, gameId], function (err) {
            if (err) {
                logger.error('Failed to update game state:', err.message);
                return reject(err);
            }
            resolve();
        });
    });
}

async function checkForEndOfFeedback(gameId) {
    return new Promise((resolve, reject) => {
        const gameSql = `SELECT current_round FROM games WHERE game_id = ?`;
        db.get(gameSql, [gameId], (err, game) => {
            if (err) return reject(err);
            if (!game) return resolve(false);

            const currentRound = game.current_round;

            const feedbackSql = `
                SELECT feedback FROM actions
                WHERE game_id = ? AND round_number = ? AND action = 'guess'
            `;
            db.all(feedbackSql, [gameId, currentRound], (err, rows) => {
                if (err) return reject(err);
                if (rows.length === 0) return resolve(false);

                const allFeedbackGiven = rows.every(row => row.feedback !== null);
                const hasCorrectGuess = rows.some(row => row.feedback === 5);

                if (allFeedbackGiven) {
                    if (hasCorrectGuess) {
                        // Game completed, trigger scoring
                        db.run(`UPDATE games SET state = 'completed' WHERE game_id = ?`, [gameId], async (err) => {
                            if (err) return reject(err);
                            logger.info(`Game ${gameId} completed.`);
                        });
                        db.run(`UPDATE games SET status = 'completed' WHERE game_id = ?`, [gameId], async (err) => {
                            if (err) return reject(err);
                            logger.info(`Game ${gameId} completed.`);
                            resolve(true);
                        });
                    } else {
                        // No correct guess, increment round
                        db.run(`UPDATE games SET current_round = current_round + 1 WHERE game_id = ?`, [gameId], (err) => {
                            if (err) return reject(err);
                            logger.info(`Game ${gameId} moved to next round.`);
                            resolve(true);
                        });
                    }
                } else {
                    resolve(false);
                }
            });
        });
    });
}

// Get the latest completed game_id
async function getLatestGameId() {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT game_id FROM games WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
            (err, row) => {
                if (err) {
                    logger.error('Error fetching latest game ID:', err.message);
                    reject(err);
                } else {
                    resolve(row ? row.game_id : null);
                }
            }
        );
    });
}


module.exports = {
    getActiveGame,
    createNewGame,
    getGameById,
    getGameState,
    checkForEndOfGuessing,
    checkForEndOfFeedback,
    setGameState,
    getLatestGameId
  };