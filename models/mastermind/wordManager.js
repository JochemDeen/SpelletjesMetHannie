//models/mastermind/wordManager.js
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

const db = require('../db');

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
let validationWordsList = [];

// Load validation words into memory when the service starts
(async function loadValidationWords() {
  try {
    const data = fs.readFileSync(validationFilePath, 'utf-8');
    validationWordsList = data.split('\n').map(word => word.trim().toLowerCase()).filter(word => word.length > 0);
    logger.info(`Loaded ${validationWordsList.length} validation words into memory.`);

  } catch (error) {
    logger.error('Error loading words from 5wordlist.txt:', error);
  }
})();


// Function to get or set the word of the day in the database
function getRandomWord(list = wordsList) {
  return list[Math.floor(Math.random() * list.length)];
}

// Get words used in the past month
function getRecentlyUsedWords() {
  return new Promise((resolve, reject) => {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0];

    db.all(
      'SELECT word FROM mastermind_word WHERE date >= ?',
      [oneMonthAgoStr],
      (err, rows) => {
        if (err) {
          return reject(err);
        }
        const usedWords = rows.map(row => row.word.toLowerCase());
        resolve(usedWords);
      }
    );
  });
}

async function getWordOfTheDay() {
  logger.info('Getting word of the day.');

  return new Promise(async (resolve, reject) => {
    const today = new Date().toISOString().split('T')[0];
    db.get('SELECT word FROM mastermind_word WHERE date = ?', [today], async (err, row) => {
      if (err) {
        return reject(err);
      }
      if (row) {
        logger.info(`Word of the day for ${today} is: ${row.word}`);
        resolve(row.word);
      } else {
        // Get words used in the past month and exclude them
        try {
          const recentlyUsedWords = await getRecentlyUsedWords();
          const availableWords = wordsList.filter(
            word => !recentlyUsedWords.includes(word.toLowerCase())
          );

          if (availableWords.length === 0) {
            logger.warn('All words have been used in the past month, falling back to full list');
          }

          const wordOfTheDay = getRandomWord(availableWords.length > 0 ? availableWords : wordsList);
          logger.info(`Selected word "${wordOfTheDay}" after excluding ${recentlyUsedWords.length} recently used words`);

          db.run('INSERT INTO mastermind_word (date, word) VALUES (?, ?)', [today, wordOfTheDay], (err) => {
            if (err) {
              return reject(err);
            }
            logger.info(`Set word of the day for ${today} to: ${wordOfTheDay}`);
            resolve(wordOfTheDay);
          });
        } catch (error) {
          return reject(error);
        }
      }
    });
  });
}

async function validateWord(word) {
  logger.info(`Validating word: ${word}`);
  return validationWordsList.includes(word.toLowerCase());
}


// Wordle-style feedback per letter: exact matches first, then misplaced
// letters, each letter of the word used at most once.
function generateFeedback(guess, wordOfTheDay) {
  if (!guess || !wordOfTheDay || guess.length !== wordOfTheDay.length) {
      throw new Error('Invalid guess or word of the day. They must be non-empty and of equal length.');
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
