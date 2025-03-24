//models/pictionary/ratingsManager.js
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');
const db = require('../db');
const wordsService = require('../wordsService');

// Get file paths from wordsService
const fileMap = wordsService.getPictionaryWordFiles();

// Check if a word already exists in suggestions
async function getSuggestionByWord(word) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, user_id, difficulty FROM pictionary_word_suggestions 
       WHERE LOWER(word) = LOWER(?)`,
      [word],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// Check if a word exists in the standard word lists
async function checkWordExistsInWordLists(word) {
  return new Promise((resolve, reject) => {
    let wordExists = false;
    let filesChecked = 0;
    
    // Function to check a word file
    const checkWordFile = (filePath, callback) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          logger.error(`Error reading file ${filePath}:`, err);
          callback(false);
          return;
        }
        
        const words = data.split('\n')
          .map(w => w.trim().toLowerCase())
          .filter(w => w.length > 0);
          
        callback(words.includes(word.toLowerCase()));
      });
    };
    
    // Check each difficulty file
    Object.values(fileMap).forEach(filePath => {
      checkWordFile(filePath, (exists) => {
        if (exists) {
          wordExists = true;
        }
        
        filesChecked++;
        
        // Once all files are checked
        if (filesChecked === Object.keys(fileMap).length) {
          resolve(wordExists);
        }
      });
    });
  });
}

// Get word info from the standard word lists (to get the correct word_id)
async function getWordInfoFromLists(word) {
  return new Promise((resolve, reject) => {
    let wordInfo = null;
    let filesChecked = 0;
    const lowerCaseWord = word.toLowerCase();
    
    // Function to check a word file
    const checkWordFile = (difficulty, filePath, callback) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          logger.error(`Error reading file ${filePath}:`, err);
          callback(null);
          return;
        }
        
        const words = data.split('\n')
          .map(w => w.trim())
          .filter(w => w.length > 0);
        
        // Find the word (case insensitive but preserve original case)
        const foundWord = words.find(w => w.toLowerCase() === lowerCaseWord);
        
        if (foundWord) {
          callback({
            word: foundWord,
            difficulty,
            id: `${difficulty}_${foundWord}`
          });
        } else {
          callback(null);
        }
      });
    };
    
    // Check each difficulty file
    Object.entries(fileMap).forEach(([difficulty, filePath]) => {
      checkWordFile(difficulty, filePath, (info) => {
        if (info) {
          wordInfo = info;
        }
        
        filesChecked++;
        
        // Once all files are checked
        if (filesChecked === Object.keys(fileMap).length) {
          resolve(wordInfo);
        }
      });
    });
  });
}

// Check if a word already exists anywhere (word lists or suggestions)
async function checkWordExists(word) {
  try {
    // First check in suggestions
    const suggestion = await getSuggestionByWord(word);
    if (suggestion) return true;
    
    // Then check in word lists
    return await checkWordExistsInWordLists(word);
  } catch (error) {
    logger.error('Error checking if word exists:', error);
    throw error;
  }
}

// Get a user's rating for a specific word
async function getUserWordRating(userId, word) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, rating FROM pictionary_word_ratings 
       WHERE user_id = ? AND LOWER(word) = LOWER(?)`,
      [userId, word],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// Update a user's existing word rating
async function updateUserWordRating(ratingId, newRating) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE pictionary_word_ratings 
       SET rating = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [newRating, ratingId],
      err => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// Insert a new user word rating
async function insertUserWordRating(userId, word, wordId, rating) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO pictionary_word_ratings 
       (user_id, word, word_id, rating) 
       VALUES (?, ?, ?, ?)`,
      [userId, word, wordId, rating],
      err => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// Insert a user-suggested word and return the new ID
async function insertSuggestedWord(userId, word, difficulty) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO pictionary_word_suggestions 
       (user_id, word, difficulty) 
       VALUES (?, ?, ?)`,
      [userId, word, difficulty],
      function(err) {  // Use regular function to access this.lastID
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}
  
// Get a word the user hasn't rated yet
async function getUnratedWordForUser(userId) {
  return new Promise((resolve, reject) => {
    // Get all words from all difficulty levels
    const allWordSets = [];
    let processedSets = 0;
    
    // Function to read a word file
    const readWordFile = (filePath, difficulty, callback) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          logger.error(`Error reading file ${filePath}:`, err);
          callback([]);
          return;
        }
        
        const words = data.split('\n')
          .map(word => word.trim())
          .filter(word => word.length > 0);
          
        callback(words.map(word => ({ 
          word, 
          difficulty,
          id: `${difficulty}_${word}`
        })));
      });
    };
    
    // Read each difficulty file
    Object.entries(fileMap).forEach(([difficulty, filePath]) => {
      readWordFile(filePath, difficulty, (wordObjects) => {
        allWordSets.push(...wordObjects);
        processedSets++;
        
        // Once all files are processed
        if (processedSets === Object.keys(fileMap).length) {
          // Get words user has already rated
          db.all(
            `SELECT word FROM pictionary_word_ratings WHERE user_id = ?`,
            [userId],
            (err, ratedWords) => {
              if (err) {
                reject(err);
                return;
              }
              
              // Convert to a set for faster lookups
              const ratedWordsSet = new Set(ratedWords.map(rw => rw.word.toLowerCase()));
              
              // Filter to unrated words
              const unratedWords = allWordSets.filter(w => !ratedWordsSet.has(w.word.toLowerCase()));
              
              // Also get suggested words not by this user
              db.all(
                `SELECT id, word, difficulty FROM pictionary_word_suggestions 
                 WHERE user_id != ? AND status = 'pending'`,
                [userId],
                (err, suggestedWords) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  
                  // Format suggested words
                  const suggestedWordObjects = suggestedWords.map(sw => ({
                    word: sw.word,
                    difficulty: sw.difficulty,
                    id: `suggested_${sw.id}`,
                    isUserSuggestion: true
                  }));
                  
                  // Add unrated suggested words
                  unratedWords.push(
                    ...suggestedWordObjects.filter(sw => !ratedWordsSet.has(sw.word.toLowerCase()))
                  );
                  
                  if (unratedWords.length === 0) {
                    // User has rated all words
                    resolve(null);
                  } else {
                    // Return a random unrated word
                    const randomWord = unratedWords[Math.floor(Math.random() * unratedWords.length)];
                    resolve(randomWord);
                  }
                }
              );
            }
          );
        }
      });
    });
  });
}

// Get a random word, with preference to user-suggested words
async function getRandomWordWithPreference(userId) {
  return new Promise((resolve, reject) => {
    // Decide whether to show a user-suggested word (10% probability)
    const showSuggested = Math.random() < 0.1;
    
    if (showSuggested) {
      // Try to get a user-suggested word (not by this user)
      db.get(
        `SELECT id, word, difficulty FROM pictionary_word_suggestions 
         WHERE user_id != ? AND status = 'pending'
         ORDER BY RANDOM() LIMIT 1`,
        [userId],
        (err, suggestedWord) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (suggestedWord) {
            // Found a suggested word
            resolve({
              word: suggestedWord.word,
              difficulty: suggestedWord.difficulty,
              id: `suggested_${suggestedWord.id}`,
              isUserSuggestion: true
            });
            
            // Increment the used count for this suggestion
            db.run(
              `UPDATE pictionary_word_suggestions SET used_count = used_count + 1 WHERE id = ?`,
              [suggestedWord.id]
            );
            
            return;
          }
          
          // No suggested words, fall back to regular words
          getRandomRegularWord().then(resolve).catch(reject);
        }
      );
    } else {
      // Get a regular word
      getRandomRegularWord().then(resolve).catch(reject);
    }
  });
}

// Get a random word from one of the standard files
async function getRandomRegularWord() {
  return new Promise((resolve, reject) => {
    // Pick a random difficulty
    const difficulties = Object.keys(fileMap);
    const randomDifficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
    const filePath = fileMap[randomDifficulty];
    
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      
      const words = data.split('\n')
        .map(word => word.trim())
        .filter(word => word.length > 0);
        
      if (words.length === 0) {
        reject(new Error(`No words found in ${randomDifficulty} file`));
        return;
      }
      
      const randomWord = words[Math.floor(Math.random() * words.length)];
      
      resolve({
        word: randomWord,
        difficulty: randomDifficulty,
        id: `${randomDifficulty}_${randomWord}`
      });
    });
  });
}
// Add this function to ratingsManager.js

// Get a suggested word from another user
async function getOtherUserSuggestion(userId) {
    return new Promise((resolve, reject) => {
      // First get a list of words this user has already rated
      db.all(
        `SELECT LOWER(word) as word FROM pictionary_word_ratings WHERE user_id = ?`,
        [userId],
        (err, ratedWords) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Convert to a set for faster lookups
          const ratedWordsSet = new Set(ratedWords.map(rw => rw.word));
          
          // Get suggested words from other users that this user hasn't rated yet
          const query = `
            SELECT id, word, difficulty 
            FROM pictionary_word_suggestions 
            WHERE user_id != ? 
            AND status = 'pending'
            ORDER BY RANDOM() 
            LIMIT 20`;  // Get a batch to filter from
          
          db.all(query, [userId], (err, suggestedWords) => {
            if (err) {
              reject(err);
              return;
            }
            
            if (!suggestedWords || suggestedWords.length === 0) {
              // No suggested words from other users
              resolve(null);
              return;
            }
            
            // Filter to words not yet rated
            const unratedSuggestions = suggestedWords.filter(sw => 
              !ratedWordsSet.has(sw.word.toLowerCase())
            );
            
            if (unratedSuggestions.length === 0) {
              // No unrated suggestions
              resolve(null);
              return;
            }
            
            // Pick a random unrated suggestion
            const suggestion = unratedSuggestions[Math.floor(Math.random() * unratedSuggestions.length)];
            
            // Increment the used count for this suggestion
            db.run(
              `UPDATE pictionary_word_suggestions SET used_count = used_count + 1 WHERE id = ?`,
              [suggestion.id]
            );
            
            // Return the suggestion with proper ID format
            resolve({
              word: suggestion.word,
              difficulty: suggestion.difficulty,
              id: `suggested_${suggestion.id}`,
              isUserSuggestion: true
            });
          });
        }
      );
    });
  }

/**
 * Get a word that has been rated by other users but not by the current user
 * Prioritizes words with more ratings to gather consensus on popular words
 * 
 * @param {number} userId - The current user's ID
 * @returns {Promise<object|null>} Word object or null if no matching words
 */
async function getWordRatedByOthersButNotUser(userId) {
    return new Promise((resolve, reject) => {
      // Get words rated by others but not by this user
      const query = `
        SELECT 
          r.word,
          r.word_id,
          COUNT(DISTINCT r.user_id) as rating_count,
          SUBSTR(r.word_id, 1, INSTR(r.word_id, '_') - 1) as difficulty
        FROM 
          pictionary_word_ratings r
        WHERE 
          r.word NOT IN (
            SELECT word FROM pictionary_word_ratings WHERE user_id = ?
          )
        GROUP BY 
          LOWER(r.word)
        HAVING 
          COUNT(DISTINCT r.user_id) >= 1
        ORDER BY 
          COUNT(DISTINCT r.user_id) DESC,
          RANDOM()
        LIMIT 1
      `;
      
      db.get(query, [userId], async (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!row) {
          // No words found that others have rated but this user hasn't
          resolve(null);
          return;
        }
        
        // Check if this is a standard word or a suggestion
        const isSuggestion = row.word_id.startsWith('suggested_');
        
        if (isSuggestion) {
          // For suggestions, we already have all the info
          resolve({
            word: row.word,
            id: row.word_id,
            difficulty: row.difficulty || 'medium',
            isUserSuggestion: true
          });
        } else {
          // For standard words, ensure the word still exists in the word files
          try {
            const wordInfo = await getWordInfoFromLists(row.word);
            
            if (wordInfo) {
              // Word exists in word lists
              resolve(wordInfo);
            } else {
              // Word no longer exists in word lists
              resolve(null);
            }
          } catch (error) {
            // Error checking word lists
            logger.error(`Error checking word lists for "${row.word}":`, error);
            resolve(null);
          }
        }
      });
    });
  }

module.exports = { 
  checkWordExists,
  checkWordExistsInWordLists,
  getWordInfoFromLists,
  getSuggestionByWord,
  getUserWordRating,
  updateUserWordRating,
  insertUserWordRating,
  insertSuggestedWord,
  getUnratedWordForUser,
  getRandomWordWithPreference,
  getRandomRegularWord,
  getOtherUserSuggestion,
  getWordRatedByOthersButNotUser
}