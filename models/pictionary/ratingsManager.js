//models/pictionary/ratingsManager.js
const logger = require('../../logger');
const db = require('../db');
const { WORD_FILES, loadWordList } = require('./wordManager');

// Every word in the standard lists as { word, difficulty, id }
function loadAllListWords() {
  return Object.keys(WORD_FILES).flatMap(difficulty =>
    loadWordList(difficulty).map(word => ({ word, difficulty, id: `${difficulty}_${word}` })));
}

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
  const lowerCaseWord = word.toLowerCase();
  return loadAllListWords().some(w => w.word.toLowerCase() === lowerCaseWord);
}

// Get word info from the standard word lists (to get the correct word_id)
async function getWordInfoFromLists(word) {
  const lowerCaseWord = word.toLowerCase();
  return loadAllListWords().find(w => w.word.toLowerCase() === lowerCaseWord) || null;
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
  const allWords = loadAllListWords();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT word FROM pictionary_word_ratings WHERE user_id = ?`,
      [userId],
      (err, ratedWords) => {
        if (err) return reject(err);
        const ratedWordsSet = new Set(ratedWords.map(rw => rw.word.toLowerCase()));
        const unratedWords = allWords.filter(w => !ratedWordsSet.has(w.word.toLowerCase()));

        // Also offer pending words suggested by other users
        db.all(
          `SELECT id, word, difficulty FROM pictionary_word_suggestions
           WHERE user_id != ? AND status = 'pending'`,
          [userId],
          (err, suggestedWords) => {
            if (err) return reject(err);
            unratedWords.push(...suggestedWords
              .filter(sw => !ratedWordsSet.has(sw.word.toLowerCase()))
              .map(sw => ({ word: sw.word, difficulty: sw.difficulty, id: `suggested_${sw.id}`, isUserSuggestion: true })));

            if (unratedWords.length === 0) {
              resolve(null); // User has rated all words
            } else {
              resolve(unratedWords[Math.floor(Math.random() * unratedWords.length)]);
            }
          }
        );
      }
    );
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
  const difficulties = Object.keys(WORD_FILES);
  const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
  const words = loadWordList(difficulty);
  if (words.length === 0) {
    throw new Error(`No words found in ${difficulty} file`);
  }
  const word = words[Math.floor(Math.random() * words.length)];
  return { word, difficulty, id: `${difficulty}_${word}` };
}
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
        LOWER(r.word) NOT IN (
          SELECT LOWER(word) FROM pictionary_word_ratings WHERE user_id = ?
        )
        AND r.user_id != ?  /* Explicitly exclude words rated by this user */
      GROUP BY 
        LOWER(r.word)
      HAVING 
        COUNT(DISTINCT r.user_id) >= 1
      ORDER BY 
        COUNT(DISTINCT r.user_id) DESC,
        RANDOM()
      LIMIT 1
    `;
    
    db.get(query, [userId, userId], async (err, row) => {
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

  // Add this new function to ratingsManager.js

/**
 * Get words where the user's rating differs from the majority opinion
 * This is useful when a user has rated all words, to show them words
 * where they might want to reconsider their rating
 * 
 * @param {number} userId - The current user's ID
 * @returns {Promise<object|null>} Word object or null if no matching words
 */
async function getWordWithDifferingOpinion(userId) {
  return new Promise((resolve, reject) => {
    // This query finds words where the user's rating differs from the most common rating
    const query = `
      WITH user_ratings AS (
        SELECT word, rating FROM pictionary_word_ratings WHERE user_id = ?
      ),
      majority_ratings AS (
        SELECT 
          word, 
          rating as majority_rating,
          COUNT(*) as count
        FROM 
          pictionary_word_ratings
        WHERE 
          word IN (SELECT word FROM user_ratings)
        GROUP BY 
          word, rating
      ),
      top_ratings AS (
        SELECT 
          word,
          majority_rating,
          MAX(count) as max_count
        FROM 
          majority_ratings
        GROUP BY 
          word
      )
      SELECT 
        ur.word,
        ur.rating as user_rating,
        tr.majority_rating,
        r.word_id
      FROM 
        user_ratings ur
      JOIN 
        top_ratings tr ON ur.word = tr.word
      JOIN 
        pictionary_word_ratings r ON r.word = ur.word
      WHERE 
        ur.rating != tr.majority_rating
      GROUP BY 
        ur.word
      ORDER BY 
        RANDOM()
      LIMIT 1
    `;
    
    db.get(query, [userId], async (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        // No words found where user opinion differs
        resolve(null);
        return;
      }

      // Check if this is a standard word or a suggestion
      const isSuggestion = row.word_id.startsWith('suggested_');
      
      if (isSuggestion) {
        // For suggestions, return with flag
        resolve({
          word: row.word,
          id: row.word_id,
          isUserSuggestion: true,
          differsFromMajority: true,
          userRating: row.user_rating,
          majorityRating: row.majority_rating
        });
      } else {
        // For standard words, ensure it still exists
        try {
          const wordInfo = await getWordInfoFromLists(row.word);
          
          if (wordInfo) {
            // Add differing opinion information
            wordInfo.differsFromMajority = true;
            wordInfo.userRating = row.user_rating;
            wordInfo.majorityRating = row.majority_rating;
            resolve(wordInfo);
          } else {
            resolve(null);
          }
        } catch (error) {
          logger.error(`Error checking word lists for "${row.word}":`, error);
          resolve(null);
        }
      }
    });
  });
}

module.exports = { 
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
  getWordRatedByOthersButNotUser,
  getWordWithDifferingOpinion
}