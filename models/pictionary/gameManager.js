//models/pictionary/gameManager.js
const sqlite3 = require('sqlite3').verbose();
const { log } = require('winston');
const logger = require('../../logger');
const db = require('../db'); 
const fs = require('fs');
const path = require('path');
const drawingManager = require('./drawingManager');

// Returns the current global active game (if any), ignoring the current user.
async function getActiveGame() {
    return new Promise((resolve, reject) => {
        logger.info("Fetching active game...");

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
                logger.info(`Active game found: ${JSON.stringify(row)}`);
                return resolve(row);
            }

            logger.info("No active game found. Checking recent completed games...");

            const now = new Date();

            // Fetch the last completed game
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

                let lastGameEndedLessThan12hAgo = false;

                if (lastGame?.completed_at) {
                    const completedAt = new Date(lastGame.completed_at);
                    const diffHoursCompleted = (now - completedAt) / (1000 * 60 * 60); // Convert ms to hours

                    logger.info(`Last game completed at: ${completedAt}, ${diffHoursCompleted.toFixed(2)} hours ago`);

                    if (diffHoursCompleted < 12) {
                        lastGameEndedLessThan12hAgo = true;
                        logger.info(`✅ Condition met: Last game ended less than 12 hours ago.`);
                    }
                } else {
                    logger.info("No completed games found.");
                }

                // Fetch the last created game
                const lastCreatedGameSql = `
                    SELECT game_id, created_at 
                    FROM games 
                    WHERE status = 'ongoing' 
                    ORDER BY created_at DESC 
                    LIMIT 1
                `;

                db.get(lastCreatedGameSql, [], (err, lastCreatedGame) => {
                    if (err) {
                        logger.error('Failed to fetch last created game:', err.message);
                        return reject(err);
                    }

                    let lastGameStartedLessThan24hAgo = false;

                    if (lastCreatedGame?.created_at) {
                        const createdAt = new Date(lastCreatedGame.created_at);
                        const diffHoursCreated = (now - createdAt) / (1000 * 60 * 60); // Convert ms to hours

                        logger.info(`Last game created at: ${createdAt}, ${diffHoursCreated.toFixed(2)} hours ago`);

                        if (diffHoursCreated < 24) {
                            lastGameStartedLessThan24hAgo = true;
                            logger.info(`✅ Condition met: Last game started less than 24 hours ago.`);
                        }
                    } else {
                        logger.info("No created games found.");
                    }

                    // If either condition is met, return "scoring" state
                    if (lastGameEndedLessThan12hAgo || lastGameStartedLessThan24hAgo) {
                        logger.info("✅ Returning 'scoring' state due to recent game.");
                        return resolve({
                            game_id: lastGame?.game_id || lastCreatedGame?.game_id,
                            state: 'scoring',
                            status: 'completed'
                        });
                    }

                    // If neither condition is met, return null
                    logger.info("❌ No conditions met. Returning null.");
                    resolve(null);
                });
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
async function CompleteGame(gameId) {
    return new Promise((resolve, reject) => {
        // Check if the game is already completed
        const checkSql = `SELECT status FROM games WHERE game_id = ?`;
        db.get(checkSql, [gameId], (err, game) => {
            if (err) return reject(err);
            if (!game) return reject(new Error(`Game ${gameId} not found.`));

            if (game.status === 'completed') {
                return resolve(false); // Already completed, no need to update
            }

            const updateSql = `UPDATE games SET state = 'completed', status = 'completed', completed_at = datetime('now') WHERE game_id = ?`;
            db.run(updateSql, [gameId], (err) => {
                if (err) return reject(err);
                logger.info(`Game ${gameId} marked as completed.`);
                resolve(true);
            });
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
            db.all(feedbackSql, [gameId, currentRound], async (err, rows) => {  
                if (err) return reject(err);
                if (rows.length === 0) return resolve(false);

                const allFeedbackGiven = rows.every(row => row.feedback !== null);
                const hasCorrectGuess = rows.some(row => row.feedback === 5);

                if (allFeedbackGiven) {
                    logger.info(`All feedback given for game ${gameId} and round ${currentRound}`);
                    if (hasCorrectGuess || currentRound >= 5) {
                        // Game completed, trigger scoring
                        try {
                            await CompleteGame(gameId);
                            resolve(true);
                        } catch (error) {
                            reject(error);
                        }
                    } else {
                        // No correct guess and not at round 5 yet, increment round
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



// Set the difficulty of an ongoing game
async function setDifficulty(gameId, difficulty) {
    return new Promise((resolve, reject) => {
        const allowedDifficulties = ['easy', 'medium', 'hard'];
        
        if (!allowedDifficulties.includes(difficulty)) {
            logger.error(`Invalid difficulty level: ${difficulty}`);
            return reject(new Error(`Invalid difficulty level: ${difficulty}`));
        }

        const sql = `UPDATE games SET difficulty = ? WHERE game_id = ? AND status = 'ongoing'`;
        
        db.run(sql, [difficulty, gameId], function (err) {
            if (err) {
                logger.error(`Failed to update difficulty for game ${gameId}:`, err.message);
                return reject(err);
            }
            if (this.changes === 0) {
                logger.warn(`Game ${gameId} not found or already completed.`);
                return resolve(false);
            }
            logger.info(`Game ${gameId} difficulty set to ${difficulty}`);
            resolve(true);
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

async function getPreviousGameId(gameId) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT game_id 
            FROM games 
            WHERE status = 'completed' 
            AND game_id < ? 
            ORDER BY game_id DESC 
            LIMIT 1
        `;
        
        db.get(sql, [gameId], (err, row) => {
            if (err) {
                logger.error(`Error fetching previous game ID for game ${gameId}:`, err.message);
                return reject(err);
            }
            resolve(row ? row.game_id : null);
        });
    });
}

async function getNextGameId(gameId) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT game_id 
            FROM games 
            WHERE status = 'completed' 
            AND game_id > ? 
            ORDER BY game_id ASC 
            LIMIT 1
        `;

        db.get(sql, [gameId], (err, row) => {
            if (err) {
                logger.error(`Error fetching next game ID for game ${gameId}:`, err.message);
                return reject(err);
            }
            resolve(row ? row.game_id : null);
        });
    });
}

async function startModificationTimer(gameId) {
    try {
        const MODIFICATION_DURATION = 10; // 10 seconds for modifications
        const endTime = new Date(Date.now() + MODIFICATION_DURATION * 1000);
        
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE games SET drawing_completed_at = ? WHERE game_id = ?',
                [endTime, gameId],
                function(err) {
                    if (err) {
                        logger.error(`Error starting modification timer for game ${gameId}:`, err);
                        return reject(err);
                    }
                    logger.info(`Started modification timer for game ${gameId}`);
                    resolve(MODIFICATION_DURATION);
                }
            );
        });
    } catch (error) {
        logger.error(`Error starting modification timer for game ${gameId}:`, error);
        throw error;
    }
}

module.exports = {
    getActiveGame,
    createNewGame,
    getGameById,
    getGameState,
    checkForEndOfGuessing,
    checkForEndOfFeedback,
    setGameState,
    getLatestGameId,
    setDifficulty,
    getPreviousGameId,
    getNextGameId,
    startModificationTimer
};