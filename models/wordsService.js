const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
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
const wordsFilePath = path.resolve(__dirname, '../data/woorden.txt');
let wordsList = [];

// Load words into memory when the service starts
(async function loadWords() {
  try {
    const data = fs.readFileSync(wordsFilePath, 'utf-8');
    wordsList = data.split('\n').map(word => word.trim().toLowerCase());
  } catch (error) {
    console.error('Error loading words from woorden.txt:', error);
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
  } catch (error) {
    console.error('Error loading words from 5wordlist.txt:', error);
  }
})();


// Function to get or set the word of the day in the database
async function getWordOfTheDay() {
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0];
    db.get('SELECT word FROM mastermind_word WHERE date = ?', [today], (err, row) => {
      if (err) {
        return reject(err);
      }
      if (row) {
        console.log(`Word of the day (existing): ${row.word}`);
        resolve(row.word);
      } else {
        const wordOfTheDay = wordsList[Math.floor(Math.random() * wordsList.length)];
        db.run('INSERT INTO mastermind_word (date, word) VALUES (?, ?)', [today, wordOfTheDay], (err) => {
          if (err) {
            return reject(err);
          }
          console.log(`Word of the day (new): ${wordOfTheDay}`);
          resolve(wordOfTheDay);
        });
      }
    });
  });
}

async function validateWord(word) {
  return validationWordsList.includes(word.toLowerCase());
}

module.exports = {
  getWordOfTheDay,
  validateWord,
};
