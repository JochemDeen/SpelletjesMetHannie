// routes/games.js

const express = require('express');
const router = express.Router();
const path = require('path');
const { requireLogin } = require('../middleware/authMiddleware');
const gameResults = require('../models/gameResults'); // Assuming this module handles game data storage
const wordsService = require('../models/wordsService'); // Assuming this module handles word validation and word of the day
const logger = require('../logger');  
const { getMonthlyScores, getHighestScorerCounts } = require('../models/gameResults');


// Mastermind Game Page
router.get('/mastermind', requireLogin, (req, res) => {
  logger.info(`GET /mastermind for user: ${req.session.userId}`);
  res.sendFile('mastermind.html', { root: path.join(__dirname, '../public') });
});

router.get('/mastermind/stats', requireLogin, (req, res) => {
  logger.info(`GET /mastermind/stats for user: ${req.session.userId}`);
    res.sendFile('mastermind-stats.html', { root: path.join(__dirname, '../public') });
});

router.get('/mastermind/compare', requireLogin, (req, res) => {
    logger.info(`GET /compare/stats for user: ${req.session.userId}`);
    res.sendFile('mastermind-compare.html', { root: path.join(__dirname, '../public') });
});

router.get('/mastermind/scoreboard', requireLogin, (req, res) => {
  logger.info(`GET /compare/scoreboard for user: ${req.session.userId}`);
  res.sendFile('mastermind-scoreboard.html', { root: path.join(__dirname, '../public') });
});



// Validate Word Endpoint
router.post('/api/validate-word', requireLogin, async (req, res) => {
    const { word } = req.body;
    logger.info(`POST /api/validate-word - User: ${req.session.userId}, Word: ${word}`);
    try {
        const isValid = await wordsService.validateWord(word);
        logger.info(`Validation result for word "${word}": ${isValid}`);
        res.json({ valid: isValid });
    } catch (error) {
        logger.error('Error validating word:', error);
        res.status(500).send('An error occurred while validating the word.');
    }
});

// Submit Guess Endpoint
router.post('/api/submit-guess', requireLogin, async (req, res) => {
    const { guess } = req.body;
    const user_id = req.session.userId;
    logger.info(`POST /api/submit-guess - User: ${user_id}, Guess: ${guess}`);

    try {
        if (!guess) {
            return res.status(400).json({ error: 'Guess is required.' });
          }
        const wordOfTheDay = await wordsService.getWordOfTheDay();
        const feedback = generateFeedback(guess, wordOfTheDay);

        // Check if the guess is correct
        const correct = feedback.every((entry) => entry === 'correct');

        // Update game results for the user
        await gameResults.updateUserGuess(user_id, guess, feedback, wordOfTheDay);
        
        logger.info(`User ${user_id} guess processed - Correct: ${correct}`);
        res.json({ correct, feedback });
    } catch (error) {
        logger.error('Error submitting guess:', error);
        res.status(500).send('An error occurred while submitting the guess.');
    }
});

// Load Game State Endpoint
router.get('/api/load-game-state', requireLogin, async (req, res) => {
    const user_id = req.session.userId;
    logger.info(`GET /api/load-game-state for user ${user_id}`);
    try {
      const gameState = await gameResults.getUserGameState(user_id);
      if (gameState) {
        res.json({ success: true, state: gameState });
      } else {
        res.json({ success: false, message: 'No game state found.' });
      }
    } catch (error) {
      logger.error('Error loading game state:', error);
      res.status(500).send('An error occurred while loading the game state.');
    }
  });

// Helper function to generate feedback for the guess
function generateFeedback(guess, wordOfTheDay) {
  if (!guess || !wordOfTheDay || guess.length !== wordOfTheDay.length) {
      throw new Error('Invalid guess or word of the day. They must be non-empty and of equal length.');
  }
  
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

  router.get('/api/get-results', requireLogin, async (req, res) => {
    const user_id = req.session.userId;
    const date = req.query.date; // Fetch date from query parameters

    try {
      const userGameState = await gameResults.getUserGameState(user_id, date);
      if (userGameState && userGameState.finished) {
        const results = await gameResults.getAllResults(user_id, date);
        res.json({ success: true, results });
      } else {
        res.status(403).json({ success: false, message: 'You need to solve the puzzle before accessing the results.' });
      }
    } catch (error) {
      logger.error('Error getting results:', error);
      res.status(500).json({ error: 'An error occurred while retrieving the results.' });
    }
  });

router.get('/api/get-stats', requireLogin, async (req, res) => {
const user_id = req.session.userId;
try {
    const stats = await gameResults.getUserStats(user_id);
    res.json({ success: true, stats });
} catch (error) {
    logger.error('Error getting user stats:', error);
    res.status(500).json({ error: 'An error occurred while retrieving user statistics.' });
}
});

// Endpoint for Get Monthly Scores
router.get('/api/get-monthly-scores', requireLogin, async (req, res) => {
  logger.info('GET /api/get-monthly-scores');
  try {
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const scores = await getMonthlyScores(currentMonth);
    res.json({ success: true, scores });
  } catch (error) {
    logger.error('Error fetching monthly scores:', error);
    res.status(500).json({ success: false, error: 'An error occurred while retrieving monthly scores.' });
  }
});

// Endpoint for Get Highest Scorer Counts
router.get('/api/get-highest-scorer-counts', requireLogin, async (req, res) => {
  logger.info('GET /api/get-highest-scorer-counts');
  try {
      const highestScores = await getHighestScorerCounts(); // Now returns the array directly
      res.json({ success: true, highestScores });
  } catch (error) {
      logger.error('Error fetching highest scorer counts:', error);
      res.status(500).json({ success: false, error: 'An error occurred while retrieving highest scorer counts.' });
  }
});

// GET /api/get-earliest-date
router.get('/api/get-earliest-date', requireLogin, async (req, res) => {
  try {
      const earliestDate = await gameResults.getEarliestDate(); // Delegate to the model
      if (earliestDate) {
          res.json({ success: true, earliestDate });
      } else {
          res.status(404).json({ success: false, message: 'No results available.' });
      }
  } catch (error) {
      logger.error('Error fetching earliest date:', error);
      res.status(500).json({ success: false, message: 'An error occurred while fetching the earliest date.' });
  }
});


module.exports = router;
