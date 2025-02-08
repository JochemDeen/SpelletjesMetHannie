//models/pictionary/guessesManager.js
const sqlite3 = require('sqlite3').verbose();
const logger = require('../../logger');
const db = require('../db'); 

async function getGuesses(gameId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT user_id, round_number, content as text, created_at as time, feedback
        FROM actions
        WHERE game_id = ? AND action = 'guess'
        ORDER BY created_at ASC
      `;
      db.all(sql, [gameId], (err, rows) => {
        if (err) {
          logger.error('Failed to fetch guesses from table:', err.message);
          return reject(err);
        }
        resolve(rows);
      });
    });
  }

async function getRoundNumber(gameId, userId) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT MAX(round_number) AS round_number
            FROM actions
            WHERE game_id = ? AND user_id = ? AND action = 'guess'
        `;
        db.get(sql, [gameId, userId], (err, row) => {
            if (err) {
                logger.error('Failed to fetch round number:', err.message);
                return reject(err);
            }
            const roundNumber = row?.round_number ?? 0;
            logger.info(`Fetched round number for user ${userId} in game ${gameId}: ${roundNumber}`);
            resolve(roundNumber);
        });
    });
}

async function submitGuess(gameId, userId, roundNumber, guess) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO actions (game_id, user_id, action, round_number, content)
        VALUES (?, ?, 'guess', ?, ?)
      `;
      db.run(sql, [gameId, userId, roundNumber, guess], function (err) {
        if (err) {
          logger.error('Failed to insert guess:', err.message);
          return reject(err);
        }
        resolve();
      });
    });
  }

  async function getGuessesToGrade(gameId, roundNumber) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT action_id, user_id, content as text, created_at as time
            FROM actions
            WHERE game_id = ? AND round_number = ? AND action = 'guess'
            ORDER BY created_at ASC
        `;
        db.all(sql, [gameId, roundNumber], (err, rows) => {
            if (err) {
                logger.error('Failed to fetch guesses for grading:', err.message);
                return reject(err);
            }
            resolve(rows);
        });
    });
}

async function submitFeedback(actionId, feedback) {
    return new Promise((resolve, reject) => {
        const sql = `
            UPDATE actions
            SET feedback = ?
            WHERE action_id = ?
        `;
        db.run(sql, [feedback, actionId], function (err) {
            if (err) {
                logger.error('Failed to update feedback:', err.message);
                return reject(err);
            }
            resolve();
        });
    });
}
module.exports = {
    getGuesses,
    getRoundNumber,
    submitGuess,
    getGuessesToGrade,
    submitFeedback
};