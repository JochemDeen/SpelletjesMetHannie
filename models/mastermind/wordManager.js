//models/mastermind/wordManager.js
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

const db = require('../db');
const { todayNL, addDays } = require('./dates');

// Load the words from the file
const wordsFilePath = path.resolve(__dirname, '../../data/filtered_woorden.txt');
let wordsList = [];

// Load words into memory when the service starts
(async function loadWords() {
  try {
    const data = fs.readFileSync(wordsFilePath, 'utf-8');
    wordsList = data.split('\n').map(word => word.trim().toLowerCase()).filter(word => word.length > 0);
    logger.info(`Loaded ${wordsList.length} words into memory.`);

  } catch (error) {
    logger.error('Error loading words from filtered_woorden.txt:', error);
  }
})();

// Load validation words from 5wordlist.txt
const validationFilePath = path.resolve(__dirname, '../../data/5wordlist.txt');
let validationWords = new Set();

// Load validation words into memory when the service starts
(async function loadValidationWords() {
  try {
    const data = fs.readFileSync(validationFilePath, 'utf-8');
    validationWords = new Set(data.split('\n').map(word => word.trim().toLowerCase()).filter(word => word.length > 0));
    logger.info(`Loaded ${validationWords.size} validation words into memory.`);

  } catch (error) {
    logger.error('Error loading words from 5wordlist.txt:', error);
  }
})();


function getRandomWord(list = wordsList) {
  return list[Math.floor(Math.random() * list.length)];
}

// Words used as word of the day in the month before `date`
function getRecentlyUsedWords(date) {
  return new Promise((resolve, reject) => {
    db.all('SELECT word FROM mastermind_word WHERE date >= ? AND date < ?', [addDays(date, -31), date], (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(row => row.word.toLowerCase()));
    });
  });
}

function getStoredWord(date) {
  return new Promise((resolve, reject) => {
    db.get('SELECT word FROM mastermind_word WHERE date = ?', [date], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.word : null);
    });
  });
}

// The shared word for a (Dutch) day, picked on first request. INSERT OR
// IGNORE + re-read: when two players open the game at the same moment, both
// end up with the word that was stored first.
async function getWordOfTheDay(date = todayNL()) {
  const stored = await getStoredWord(date);
  if (stored) return stored;

  const recentlyUsedWords = new Set(await getRecentlyUsedWords(date));
  const availableWords = wordsList.filter(word => !recentlyUsedWords.has(word));
  if (availableWords.length === 0) {
    logger.warn('All words have been used in the past month, falling back to full list');
  }
  const candidate = getRandomWord(availableWords.length > 0 ? availableWords : wordsList);

  await new Promise((resolve, reject) => {
    db.run('INSERT OR IGNORE INTO mastermind_word (date, word) VALUES (?, ?)', [date, candidate], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  const word = await getStoredWord(date);
  logger.info(`Word of the day for ${date} set (${recentlyUsedWords.size} recent words excluded)`);
  return word;
}

// Is this a known five-letter word?
async function validateWord(word) {
  if (typeof word !== 'string' || word.length !== 5) return false;
  return validationWords.has(word.toLowerCase());
}

// Wordle-style feedback per letter: exact matches first, then misplaced
// letters, each letter of the word used at most once.
// Both must be strings: a JSON body could send an object with a huge
// "length", which would make the loops below run (almost) forever.
function generateFeedback(guess, wordOfTheDay) {
  if (typeof guess !== 'string' || typeof wordOfTheDay !== 'string' ||
      guess.length === 0 || guess.length !== wordOfTheDay.length) {
      throw new Error('Invalid guess or word of the day. They must be non-empty strings of equal length.');
  }

  guess = guess.toLowerCase();
  wordOfTheDay = wordOfTheDay.toLowerCase();
  
  const feedback = new Array(guess.length).fill('incorrect');
  const usedIndices = new Set();
  
  // Step 1: Mark exact matches as 'correct' and track used indices
  for (let i = 0; i < guess.length; i++) {
      if (guess[i] === wordOfTheDay[i]) {
          feedback[i] = 'correct';
          usedIndices.add(i);
      }
  }

  // Step 2: Mark misplaced letters
  for (let i = 0; i < guess.length; i++) {
      if (feedback[i] === 'correct') continue; // Skip if already marked correct
      
      // Find if guess[i] exists in wordOfTheDay but at a different position
      for (let j = 0; j < wordOfTheDay.length; j++) {
          if (guess[i] === wordOfTheDay[j] && !usedIndices.has(j)) {
              feedback[i] = 'misplaced';
              usedIndices.add(j); // Mark this position as used in wordOfTheDay
              break;
          }
      }
  }
  
  return feedback;
}

module.exports = {
  generateFeedback,
  getWordOfTheDay,
  validateWord,
  getRandomWord
};
