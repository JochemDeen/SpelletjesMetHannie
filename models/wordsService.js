//models/wordsService.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('../logger');  

const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
  db.run(`
      CREATE TABLE IF NOT EXISTS mastermind_word (
      date TEXT PRIMARY KEY,
      word TEXT NOT NULL
      )
  `);
});

// Load the words from the file
const wordsFilePath = path.resolve(__dirname, '../data/filtered_woorden.txt');
let wordsList = [];

// Load words into memory when the service starts
(async function loadWords() {
  try {
    const data = fs.readFileSync(wordsFilePath, 'utf-8');
    wordsList = data.split('\n').map(word => word.trim().toLowerCase());
    logger.info(`Loaded ${wordsList.length} words into memory.`);

  } catch (error) {
    logger.error('Error loading words from filtered_woorden.txt:', error);
  }
})();

// Load validation words from 5wordlist.txt
const validationFilePath = path.resolve(__dirname, '../data/5wordlist.txt');
let validationWordsList = [];

// Load validation words into memory when the service starts
(async function loadValidationWords() {
  try {
    const data = fs.readFileSync(validationFilePath, 'utf-8');
    validationWordsList = data.split('\n').map(word => word.trim().toLowerCase());
    logger.info(`Loaded ${validationWordsList.length} validation words into memory.`);

  } catch (error) {
    logger.error('Error loading words from 5wordlist.txt:', error);
  }
})();


// Function to get or set the word of the day in the database
function getRandomWord(list = wordsList) {
  return list[Math.floor(Math.random() * list.length)];
}

const fileMap = {
  easy: path.join(__dirname, "../data/Pictionary_easy.csv"),
  medium: path.join(__dirname, "../data/Pictionary_medium.csv"),
  hard: path.join(__dirname, "../data/Pictionary_hard.csv")
};


function getRandomPictionaryWord(difficulty = "easy") {
  const filePath = fileMap[difficulty] || fileMap.easy;

  try {
    const data = fs.readFileSync(filePath, "utf-8");
    const words = data.split("\n").map(word => word.trim()).filter(word => word.length > 0);

    if (words.length === 0) return "No words available";

    const randomIndex = Math.floor(Math.random() * words.length);
    return words[randomIndex];
  } catch (error) {
    console.error(`Error reading file: ${filePath}`, error);
    return "Error";
  }
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
  logger.info(`Validation result for word "${word}": ${isValid}`);

}

// Export the file paths for other modules to use
function getPictionaryWordFiles() {
  return fileMap;
}


module.exports = {
  getWordOfTheDay,
  validateWord,
  getRandomPictionaryWord,
  getRandomWord,
  getPictionaryWordFiles
};
