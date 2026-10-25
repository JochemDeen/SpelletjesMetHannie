//models/pictionary/wordManager.js
const logger = require('../../logger');
const db = require('../db'); 
  
    
  async function setChosenWord(gameId, word) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE games
        SET word = ?
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
      setChosenWord
  };