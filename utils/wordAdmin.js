// utils/wordAdmin.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('../logger');

// Initialize database connection
const db = new sqlite3.Database('database.sqlite');

// Get path to word files
const fileMap = {
  easy: path.join(__dirname, "../data/Pictionary_easy.csv"),
  medium: path.join(__dirname, "../data/Pictionary_medium.csv"),
  hard: path.join(__dirname, "../data/Pictionary_hard.csv")
};

// Function to get all words from a file
function getWordsFromFile(difficulty) {
  const filePath = fileMap[difficulty];
  if (!filePath) {
    throw new Error(`Invalid difficulty: ${difficulty}`);
  }
  
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return data.split('\n')
      .map(word => word.trim())
      .filter(word => word.length > 0);
  } catch (error) {
    console.error(`Error reading ${difficulty} words file:`, error);
    return [];
  }
}

// Function to save words to a file
function saveWordsToFile(difficulty, words) {
  const filePath = fileMap[difficulty];
  if (!filePath) {
    throw new Error(`Invalid difficulty: ${difficulty}`);
  }
  
  try {
    // Ensure each word is on its own line, no empty lines
    const content = words.join('\n') + '\n';
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Successfully saved ${words.length} words to ${difficulty} file`);
    return true;
  } catch (error) {
    console.error(`Error saving to ${difficulty} words file:`, error);
    return false;
  }
}

// Add a word to a specific difficulty
function addWord(word, difficulty) {
  if (!word || !difficulty) {
    console.error('Word and difficulty are required');
    return false;
  }
  
  word = word.trim();
  if (word === '') {
    console.error('Word cannot be empty');
    return false;
  }
  
  if (!fileMap[difficulty]) {
    console.error(`Invalid difficulty: ${difficulty}`);
    return false;
  }
  
  try {
    const words = getWordsFromFile(difficulty);
    
    // Check if word already exists (case insensitive)
    if (words.some(w => w.toLowerCase() === word.toLowerCase())) {
      console.log(`Word "${word}" already exists in ${difficulty} list`);
      return false;
    }
    
    // Add word and save
    words.push(word);
    return saveWordsToFile(difficulty, words);
  } catch (error) {
    console.error('Error adding word:', error);
    return false;
  }
}

// Remove a word from a specific difficulty
function removeWord(word, difficulty) {
  if (!word) {
    console.error('Word is required');
    return false;
  }
  
  word = word.trim().toLowerCase();
  if (word === '') {
    console.error('Word cannot be empty');
    return false;
  }
  
  // If difficulty is not specified, check all difficulties
  const difficultiesToCheck = difficulty ? [difficulty] : Object.keys(fileMap);
  
  let removed = false;
  
  for (const diff of difficultiesToCheck) {
    try {
      const words = getWordsFromFile(diff);
      const initialCount = words.length;
      
      // Filter out the word (case insensitive)
      const filteredWords = words.filter(w => w.toLowerCase() !== word);
      
      if (filteredWords.length < initialCount) {
        // Word was found and removed
        saveWordsToFile(diff, filteredWords);
        console.log(`Removed "${word}" from ${diff} list`);
        removed = true;
      }
    } catch (error) {
      console.error(`Error checking ${diff} list:`, error);
    }
  }
  
  return removed;
}

// Change a word's difficulty
function changeWordDifficulty(word, fromDifficulty, toDifficulty) {
  if (!word || !fromDifficulty || !toDifficulty) {
    console.error('Word, source difficulty, and target difficulty are required');
    return false;
  }
  
  if (fromDifficulty === toDifficulty) {
    console.log('Source and target difficulties are the same');
    return false;
  }
  
  if (!fileMap[fromDifficulty] || !fileMap[toDifficulty]) {
    console.error('Invalid difficulty level(s)');
    return false;
  }
  
  word = word.trim();
  if (word === '') {
    console.error('Word cannot be empty');
    return false;
  }
  
  try {
    // Get words from source difficulty
    const sourceWords = getWordsFromFile(fromDifficulty);
    
    // Find the exact word (preserving case)
    const exactWord = sourceWords.find(w => w.toLowerCase() === word.toLowerCase());
    
    if (!exactWord) {
      console.error(`Word "${word}" not found in ${fromDifficulty} list`);
      return false;
    }
    
    // Remove from source
    const updatedSourceWords = sourceWords.filter(w => w !== exactWord);
    saveWordsToFile(fromDifficulty, updatedSourceWords);
    
    // Add to target
    const targetWords = getWordsFromFile(toDifficulty);
    
    // Check if word already exists in target (case insensitive)
    if (targetWords.some(w => w.toLowerCase() === exactWord.toLowerCase())) {
      console.log(`Word "${exactWord}" already exists in ${toDifficulty} list`);
      return false;
    }
    
    targetWords.push(exactWord);
    saveWordsToFile(toDifficulty, targetWords);
    
    console.log(`Moved "${exactWord}" from ${fromDifficulty} to ${toDifficulty}`);
    return true;
  } catch (error) {
    console.error('Error changing word difficulty:', error);
    return false;
  }
}

// Get suggestions that need review (rated by multiple users)
function getSuggestionsForReview(minRatings = 3) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        s.id, 
        s.word, 
        s.difficulty as suggested_difficulty,
        s.user_id as suggester_id,
        s.used_count,
        COUNT(r.id) as rating_count,
        SUM(CASE WHEN r.rating = 'easy' THEN 1 ELSE 0 END) as easy_count,
        SUM(CASE WHEN r.rating = 'medium' THEN 1 ELSE 0 END) as medium_count,
        SUM(CASE WHEN r.rating = 'hard' THEN 1 ELSE 0 END) as hard_count,
        SUM(CASE WHEN r.rating = 'drop' THEN 1 ELSE 0 END) as drop_count
      FROM 
        pictionary_word_suggestions s
      JOIN 
        pictionary_word_ratings r ON LOWER(r.word) = LOWER(s.word)
      WHERE 
        s.status = 'pending'
      GROUP BY 
        s.id
      HAVING 
        COUNT(r.id) >= ?
      ORDER BY 
        rating_count DESC
    `;
    
    db.all(query, [minRatings], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      resolve(rows);
    });
  });
}

// Accept a suggestion and add it to the appropriate word list
function acceptSuggestion(suggestionId, difficulty) {
  return new Promise((resolve, reject) => {
    // First get the suggestion details
    db.get(
      `SELECT word FROM pictionary_word_suggestions WHERE id = ?`,
      [suggestionId],
      (err, suggestion) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!suggestion) {
          reject(new Error(`Suggestion with ID ${suggestionId} not found`));
          return;
        }
        
        // Add word to the specified difficulty
        const added = addWord(suggestion.word, difficulty);
        
        if (!added) {
          reject(new Error(`Failed to add "${suggestion.word}" to ${difficulty} list`));
          return;
        }
        
        // Update suggestion status to 'accepted'
        db.run(
          `UPDATE pictionary_word_suggestions 
           SET status = 'accepted', difficulty = ? 
           WHERE id = ?`,
          [difficulty, suggestionId],
          err => {
            if (err) {
              reject(err);
              return;
            }
            
            console.log(`Accepted suggestion "${suggestion.word}" to ${difficulty} difficulty`);
            resolve(true);
          }
        );
      }
    );
  });
}

// Reject a suggestion
function rejectSuggestion(suggestionId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE pictionary_word_suggestions SET status = 'rejected' WHERE id = ?`,
      [suggestionId],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          reject(new Error(`Suggestion with ID ${suggestionId} not found`));
          return;
        }
        
        console.log(`Rejected suggestion with ID ${suggestionId}`);
        resolve(true);
      }
    );
  });
}

// Get words with most 'drop' ratings
// Get words with most 'drop' ratings
function getWordsToRemove(minDropRatings = 3) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        word,
        COUNT(*) as total_ratings,
        SUM(CASE WHEN rating = 'drop' THEN 1 ELSE 0 END) as drop_count,
        (SUM(CASE WHEN rating = 'drop' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as drop_percentage
      FROM 
        pictionary_word_ratings
      GROUP BY 
        LOWER(word)
      HAVING 
        drop_count >= ? AND
        drop_percentage >= 50
      ORDER BY 
        drop_percentage DESC, total_ratings DESC
    `;
    
    db.all(query, [minDropRatings], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      // For each word, determine which difficulty file it's in
      const processedRows = rows.map(row => {
        const word = row.word;
        let difficulty = null;
        
        // Check each difficulty file
        for (const diff of ['easy', 'medium', 'hard']) {
          try {
            const words = getWordsFromFile(diff);
            if (words.some(w => w.toLowerCase() === word.toLowerCase())) {
              difficulty = diff;
              break;
            }
          } catch (error) {
            console.error(`Error checking ${diff} file:`, error);
          }
        }
        
        return {
          ...row,
          difficulty
        };
      });
      
      resolve(processedRows);
    });
  });
}

// Get words that might need to change difficulty based on ratings
function getWordsToChangeDifficulty(minRatings = 5, thresholdPercentage = 60) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        r.word,
        r.word_id,
        COUNT(*) as total_ratings,
        SUM(CASE WHEN r.rating = 'easy' THEN 1 ELSE 0 END) as easy_count,
        SUM(CASE WHEN r.rating = 'medium' THEN 1 ELSE 0 END) as medium_count,
        SUM(CASE WHEN r.rating = 'hard' THEN 1 ELSE 0 END) as hard_count,
        (SUM(CASE WHEN r.rating = 'easy' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as easy_percentage,
        (SUM(CASE WHEN r.rating = 'medium' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as medium_percentage,
        (SUM(CASE WHEN r.rating = 'hard' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as hard_percentage
      FROM 
        pictionary_word_ratings r
      WHERE
        r.word_id LIKE 'easy_%' OR r.word_id LIKE 'medium_%' OR r.word_id LIKE 'hard_%'
      GROUP BY 
        LOWER(r.word)
      HAVING 
        total_ratings >= ?
      ORDER BY 
        total_ratings DESC
    `;
    
    db.all(query, [minRatings], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Filter words that have a strong bias toward a different difficulty
      const wordsToChange = rows.filter(row => {
        // Extract current difficulty from word_id
        const currentDifficulty = row.word_id.split('_')[0];
        
        // Check if there's a strong consensus for a different difficulty
        if (currentDifficulty === 'easy' && row.medium_percentage + row.hard_percentage >= thresholdPercentage) {
          // Easy word that should be harder
          const targetDifficulty = row.hard_percentage > row.medium_percentage ? 'hard' : 'medium';
          row.current_difficulty = currentDifficulty;
          row.recommended_difficulty = targetDifficulty;
          row.change_reason = `${row.medium_percentage.toFixed(1)}% medium + ${row.hard_percentage.toFixed(1)}% hard ratings`;
          return true;
        } else if (currentDifficulty === 'medium') {
          if (row.easy_percentage >= thresholdPercentage) {
            // Medium word that should be easier
            row.current_difficulty = currentDifficulty;
            row.recommended_difficulty = 'easy';
            row.change_reason = `${row.easy_percentage.toFixed(1)}% easy ratings`;
            return true;
          } else if (row.hard_percentage >= thresholdPercentage) {
            // Medium word that should be harder
            row.current_difficulty = currentDifficulty;
            row.recommended_difficulty = 'hard';
            row.change_reason = `${row.hard_percentage.toFixed(1)}% hard ratings`;
            return true;
          }
        } else if (currentDifficulty === 'hard' && row.easy_percentage + row.medium_percentage >= thresholdPercentage) {
          // Hard word that should be easier
          const targetDifficulty = row.easy_percentage > row.medium_percentage ? 'easy' : 'medium';
          row.current_difficulty = currentDifficulty;
          row.recommended_difficulty = targetDifficulty;
          row.change_reason = `${row.easy_percentage.toFixed(1)}% easy + ${row.medium_percentage.toFixed(1)}% medium ratings`;
          return true;
        }
        
        return false;
      });
      
      resolve(wordsToChange);
    });
  });
}

/**
 * Get comprehensive statistics about the Pictionary words database
 * @returns {Object} Statistics object with various metrics
 */
async function getWordStatistics() {
  return new Promise((resolve, reject) => {
    try {
      // Initialize statistics object
      const stats = {
        totalWords: 0,
        easyWords: 0,
        mediumWords: 0,
        hardWords: 0,
        pendingSuggestions: 0,
        totalRatings: 0,
        uniqueRaters: 0,
        easyRatings: 0,
        mediumRatings: 0,
        hardRatings: 0,
        dropRatings: 0,
        averageRatingsPerWord: 0,
        unratedWords: 0,
        mostRatedWord: { word: '', count: 0 }
      };
      
      // Count words from files
      const difficulties = ['easy', 'medium', 'hard'];
      let allWords = [];
      
      difficulties.forEach(difficulty => {
        try {
          const words = getWordsFromFile(difficulty);
          stats[`${difficulty}Words`] = words.length;
          stats.totalWords += words.length;
          allWords = allWords.concat(words);
        } catch (error) {
          console.error(`Error counting ${difficulty} words:`, error);
        }
      });
      
      // Get pending suggestions count
      const pendingSuggestionsQuery = `
        SELECT COUNT(*) as count
        FROM pictionary_word_suggestions
        WHERE status = 'pending'
      `;
      
      db.get(pendingSuggestionsQuery, [], (err, row) => {
        if (err) {
          console.error("Error getting pending suggestions count:", err);
          // Continue execution even if this fails
          stats.pendingSuggestions = 0;
        } else {
          stats.pendingSuggestions = row ? row.count : 0;
        }
        
        // Get rating statistics
        const ratingStatsQuery = `
          SELECT 
            COUNT(*) as total_ratings,
            COUNT(DISTINCT user_id) as unique_raters,
            SUM(CASE WHEN rating = 'easy' THEN 1 ELSE 0 END) as easy_ratings,
            SUM(CASE WHEN rating = 'medium' THEN 1 ELSE 0 END) as medium_ratings,
            SUM(CASE WHEN rating = 'hard' THEN 1 ELSE 0 END) as hard_ratings,
            SUM(CASE WHEN rating = 'drop' THEN 1 ELSE 0 END) as drop_ratings
          FROM pictionary_word_ratings
        `;
        
        db.get(ratingStatsQuery, [], (err, row) => {
          if (err) {
            console.error("Error getting rating statistics:", err);
            // Continue execution even if this fails
          } else if (row) {
            stats.totalRatings = row.total_ratings || 0;
            stats.uniqueRaters = row.unique_raters || 0;
            stats.easyRatings = row.easy_ratings || 0;
            stats.mediumRatings = row.medium_ratings || 0;
            stats.hardRatings = row.hard_ratings || 0;
            stats.dropRatings = row.drop_ratings || 0;
          }
          
          // Calculate average ratings per word
          if (stats.totalWords > 0 && stats.totalRatings) {
            stats.averageRatingsPerWord = stats.totalRatings / stats.totalWords;
          }
          
          // Find most rated word
          const mostRatedQuery = `
            SELECT word, COUNT(*) as count
            FROM pictionary_word_ratings
            GROUP BY word
            ORDER BY count DESC
            LIMIT 1
          `;
          
          db.get(mostRatedQuery, [], (err, row) => {
            if (err) {
              console.error("Error finding most rated word:", err);
              // Continue execution even if this fails
            } else if (row) {
              stats.mostRatedWord = { 
                word: row.word || '', 
                count: row.count || 0 
              };
            }
            
            // Calculate unrated words
            const ratedWordsQuery = `
              SELECT DISTINCT LOWER(word) as word
              FROM pictionary_word_ratings
            `;
            
            db.all(ratedWordsQuery, [], (err, rows) => {
              if (err) {
                console.error("Error getting rated words:", err);
                // Continue execution even if this fails
                stats.unratedWords = 0;
              } else {
                // Convert to lowercase for case-insensitive comparison
                const ratedWords = new Set(rows.map(row => row.word.toLowerCase()));
                
                // Count words not in the rated set
                const unratedCount = allWords.filter(word => 
                  !ratedWords.has(word.toLowerCase())
                ).length;
                
                stats.unratedWords = unratedCount;
              }
              
              // All stats gathered, resolve promise
              resolve(stats);
            });
          });
        });
      });
      
    } catch (error) {
      console.error('Error getting word statistics:', error);
      reject(error);
    }
  });
}


module.exports = {
  addWord,
  removeWord,
  changeWordDifficulty,
  getSuggestionsForReview,
  acceptSuggestion,
  rejectSuggestion,
  getWordsToRemove,
  getWordsToChangeDifficulty,
  getWordStatistics
};