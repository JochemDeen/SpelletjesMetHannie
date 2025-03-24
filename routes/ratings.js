// routes/ratings.js
const express = require('express');
const router = express.Router();
const path = require('path');
const { requireLogin } = require('../middleware/authMiddleware');
const logger = require('../logger');
const Users = require('../models/user');
const wordsService = require('../models/wordsService');
const RatingsManager = require('../models/pictionary/ratingsManager');

// Pictionary rate words page
router.get('/pictionary/rate-words', requireLogin, (req, res) => {
    logger.info(`GET /pictionary/rate-words for user: ${req.session.userId}`);
    res.sendFile('rate-words.html', { root: path.join(__dirname, '../public/pictionary') });
});

// Get a random word for rating with three-tier selection priority
router.get('/api/pictionary/random-word-to-rate', requireLogin, async (req, res) => {
    const userId = req.session.userId;
    logger.info(`GET /api/pictionary/random-word-to-rate for user: ${userId}`);
  
    try {
      // Tier 1: Give a 15% chance to show a suggested word from another user
      const showSuggestedWord = Math.random() < 0.15;
      
      if (showSuggestedWord) {
        // Try to get a suggested word from another user
        const suggestedWord = await RatingsManager.getOtherUserSuggestion(userId);
        
        if (suggestedWord) {
          logger.info(`Serving suggested word "${suggestedWord.word}" to user ${userId}`);
          return res.json({ 
            success: true, 
            word: suggestedWord.word, 
            word_id: suggestedWord.id,
            isSuggested: true
          });
        }
        // If no suggested words found, fall through to next tier
      }
      
      // Tier 2: Give a 50% chance to show a word already rated by others but not by this user
      const showRatedByOthers = Math.random() < 0.5;
      
      if (showRatedByOthers) {
        // Try to get a word rated by others but not by this user
        const popularWord = await RatingsManager.getWordRatedByOthersButNotUser(userId);
        
        if (popularWord) {
          logger.info(`Serving popular word "${popularWord.word}" to user ${userId}`);
          return res.json({ 
            success: true, 
            word: popularWord.word, 
            word_id: popularWord.id
          });
        }
        // If no such words found, fall through to next tier
      }
      
      // Tier 3: Find a word the user hasn't rated yet from standard word lists
      const word = await RatingsManager.getUnratedWordForUser(userId);
      
      if (word) {
        logger.info(`Serving unrated word "${word.word}" to user ${userId}`);
        return res.json({ success: true, word: word.word, word_id: word.id });
      }
      
      // Final fallback: If all words have been rated, get a random word
      const randomWord = await RatingsManager.getRandomWordWithPreference(userId);
      logger.info(`Serving random word "${randomWord.word}" to user ${userId}`);
      return res.json({ success: true, word: randomWord.word, word_id: randomWord.id });
      
    } catch (error) {
      logger.error('Error fetching random word to rate:', error.message);
      res.status(500).json({ success: false, error: 'Failed to fetch random word' });
    }
  });
// Rate a word
router.post('/api/pictionary/rate-word', requireLogin, async (req, res) => {
  const { word, word_id, rating } = req.body;
  const userId = req.session.userId;
  
  logger.info(`POST /api/pictionary/rate-word by user: ${userId}, word: ${word}, rating: ${rating}`);

  try {
    // Check if user has already rated this word
    const existingRating = await RatingsManager.getUserWordRating(userId, word);
    
    if (existingRating) {
      // Update existing rating
      await RatingsManager.updateUserWordRating(existingRating.id, rating);
      logger.info(`Updated rating for word "${word}" by user ${userId} to "${rating}"`);
    } else {
      // Insert new rating
      await RatingsManager.insertUserWordRating(userId, word, word_id, rating);
      logger.info(`New rating for word "${word}" by user ${userId}: "${rating}"`);
    }
    
    res.json({ success: true, message: 'Rating saved successfully' });
  } catch (error) {
    logger.error('Error saving word rating:', error.message);
    res.status(500).json({ success: false, error: 'Failed to save rating' });
  }
});

// Suggest a new word
router.post('/api/pictionary/suggest-word', requireLogin, async (req, res) => {
  const { word, difficulty } = req.body;
  const userId = req.session.userId;
  
  logger.info(`POST /api/pictionary/suggest-word by user: ${userId}, word: ${word}, difficulty: ${difficulty}`);

  // Basic validation
  if (!word || word.trim() === '') {
    return res.status(400).json({ success: false, error: 'Word cannot be empty' });
  }
  
  if (!['easy', 'medium', 'hard', 'drop'].includes(difficulty)) {
    return res.status(400).json({ success: false, error: 'Invalid difficulty level' });
  }

  try {
    // Check if word already exists in standard word lists
    const existsInWordLists = await RatingsManager.checkWordExistsInWordLists(word);
    
    if (existsInWordLists) {
      // Word exists in standard word lists, treat this as a rating instead of a suggestion
      logger.info(`Word "${word}" already exists in word lists. Treating as a rating.`);
      
      // Find the exact word_id from the word lists
      const wordInfo = await RatingsManager.getWordInfoFromLists(word);
      
      if (wordInfo) {
        // Check if user has already rated this word
        const existingRating = await RatingsManager.getUserWordRating(userId, word);
        
        if (existingRating) {
          // Update existing rating to match the suggested difficulty
          await RatingsManager.updateUserWordRating(existingRating.id, difficulty);
          logger.info(`Updated rating for existing word "${word}" by user ${userId} to "${difficulty}"`);
        } else {
          // Insert new rating
          await RatingsManager.insertUserWordRating(userId, word, wordInfo.id, difficulty);
          logger.info(`New rating for existing word "${word}" by user ${userId}: "${difficulty}"`);
        }
        
        return res.json({ 
          success: true, 
          message: 'Word already exists in our lists. Your rating has been saved.',
          existing: true
        });
      }
    }
    
    // Check if word already exists in suggestions
    const existingSuggestion = await RatingsManager.getSuggestionByWord(word);
    
    if (existingSuggestion) {
      // Word has already been suggested by another user
      logger.info(`Word "${word}" already suggested by user ${existingSuggestion.user_id}. Adding rating.`);
      
      // Check if this user has already rated this word
      const existingRating = await RatingsManager.getUserWordRating(userId, word);
      
      if (existingRating) {
        // Update existing rating
        await RatingsManager.updateUserWordRating(existingRating.id, difficulty);
        logger.info(`Updated rating for suggested word "${word}" by user ${userId} to "${difficulty}"`);
      } else {
        // Insert new rating
        await RatingsManager.insertUserWordRating(
          userId, 
          word, 
          `suggested_${existingSuggestion.id}`, 
          difficulty
        );
        logger.info(`New rating for suggested word "${word}" by user ${userId}: "${difficulty}"`);
      }
      
      return res.json({ 
        success: true, 
        message: 'This word has already been suggested. Your rating has been saved.',
        existing: true 
      });
    }
    
    // This is a new suggestion
    const newSuggestionId = await RatingsManager.insertSuggestedWord(userId, word, difficulty);
    logger.info(`New word suggestion from user ${userId}: "${word}" (${difficulty})`);
    
    // Also add a rating from this user
    await RatingsManager.insertUserWordRating(
      userId, 
      word, 
      `suggested_${newSuggestionId}`, 
      difficulty
    );
    logger.info(`Added rating for newly suggested word "${word}" by user ${userId}: "${difficulty}"`);
    
    res.json({ success: true, message: 'Word suggestion saved successfully' });
  } catch (error) {
    logger.error('Error saving word suggestion:', error.message);
    res.status(500).json({ success: false, error: 'Failed to save word suggestion' });
  }
});

module.exports = router;