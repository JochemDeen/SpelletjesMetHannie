//models/pictionary/wordManager.js
const sqlite3 = require('sqlite3').verbose();
const logger = require('../../logger');
const db = require('../db'); 

async function getCurrentWords(gameId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT current_words FROM games WHERE game_id = ?`;
      db.get(sql, [gameId], (err, row) => {
        if (err) {
          logger.error('Failed to fetch current words:', err.message);
          return reject(err);
        }
        resolve(row?.current_words || '[]');
      });
    });
  }
  
  async function updateCurrentWords(gameId, wordsJSON) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE games SET current_words = ? WHERE game_id = ?`;
      db.run(sql, [wordsJSON, gameId], (err) => {
        if (err) {
          logger.error('Failed to update current words:', err.message);
          return reject(err);
        }
        resolve();
      });
    });
  }
    
  async function setChosenWord(gameId, word) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE games
        SET word = ?, state = 'drawing'
        WHERE game_id = ?
      `;
      db.run(sql, [word, gameId], (err) => {
        if (err) {
          logger.error('Failed to set chosen word:', err.message);
          return reject(err);
        }
        logger.info(`Word "${word}" set for gameId ${gameId}`);
        resolve();
      });
    });
  }
  
  module.exports = {
      getCurrentWords,
      updateCurrentWords,
      setChosenWord
  };