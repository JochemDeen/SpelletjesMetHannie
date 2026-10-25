//models/pictionary/wordManager.js
// The Pictionary word lists (data/Pictionary_{easy,medium,hard}.csv, one word
// per line) and the word chosen for the active game.
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');
const db = require('../db');

const WORD_FILES = {
  easy: path.join(__dirname, '../../data/Pictionary_easy.csv'),
  medium: path.join(__dirname, '../../data/Pictionary_medium.csv'),
  hard: path.join(__dirname, '../../data/Pictionary_hard.csv')
};

// Read fresh on every call: the admin scripts edit these files while the app runs.
function loadWordList(difficulty) {
  const filePath = WORD_FILES[difficulty];
  if (!filePath) {
    throw new Error(`Invalid difficulty: ${difficulty}`);
  }
  try {
    return fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0);
  } catch (error) {
    logger.error(`Error reading ${difficulty} word list:`, error);
    return [];
  }
}

function getRandomPictionaryWord(difficulty = 'easy') {
  const words = loadWordList(WORD_FILES[difficulty] ? difficulty : 'easy');
  if (words.length === 0) {
    throw new Error(`No words available for difficulty ${difficulty}`);
  }
  return words[Math.floor(Math.random() * words.length)];
}

async function setChosenWord(gameId, word) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE games SET word = ? WHERE game_id = ?', [word, gameId], (err) => {
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
  WORD_FILES,
  loadWordList,
  getRandomPictionaryWord,
  setChosenWord
};
