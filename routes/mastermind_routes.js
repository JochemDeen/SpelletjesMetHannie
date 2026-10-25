// routes/mastermind_routes.js
// Mastermind, shown to players as "Woordle".

const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/authMiddleware');
const { servePage } = require('../utils/servePage');
const Mastermind = require('../models/mastermind');
const logger = require('../logger');


// Mastermind Game Page
router.get('/mastermind', requireLogin, servePage('mastermind.html'));

router.get('/mastermind/stats', requireLogin, servePage('mastermind-stats.html'));

router.get('/mastermind/compare', requireLogin, servePage('mastermind-compare.html'));

router.get('/mastermind/scoreboard', requireLogin, servePage('mastermind-scoreboard.html'));



// Validate Word Endpoint
router.post('/api/validate-word', requireLogin, async (req, res) => {
    const { word } = req.body;
    logger.info(`POST /api/validate-word - User: ${req.session.userId}, Word: ${word}`);
    try {
        const isValid = await Mastermind.validateWord(word);
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
        if (!guess || typeof guess !== 'string') {
            return res.status(400).json({ error: 'Guess is required.' });
          }
        // The browser checks these too, but only the server can be trusted:
        // guesses must be real words, and at most until the puzzle is finished.
        if (!(await Mastermind.validateWord(guess))) {
            return res.status(400).json({ error: 'Not a valid word.' });
        }
        const gameState = await Mastermind.getUserGameState(user_id);
        if (gameState && gameState.finished) {
            return res.status(400).json({ error: 'Puzzle already finished.' });
        }
        const wordOfTheDay = await Mastermind.getWordOfTheDay();
        const feedback = Mastermind.generateFeedback(guess, wordOfTheDay);

        // Check if the guess is correct
        const correct = feedback.every((entry) => entry === 'correct');

        // Update game results for the user
        await Mastermind.updateUserGuess(user_id, guess, feedback, wordOfTheDay);
        
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
      const gameState = await Mastermind.getUserGameState(user_id);
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

  router.get('/api/get-results', requireLogin, async (req, res) => {
    const user_id = req.session.userId;
    const date = req.query.date; // Fetch date from query parameters

    try {
      const userGameState = await Mastermind.getUserGameState(user_id, date);
      if (userGameState && userGameState.finished) {
        const results = await Mastermind.getAllResults(user_id, date);
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
    const stats = await Mastermind.getUserStats(user_id);
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
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const scores = await Mastermind.getMonthlyScores(month);
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
      const highestScores = await Mastermind.getHighestScorerCounts(); // Now returns the array directly
      res.json({ success: true, highestScores });
  } catch (error) {
      logger.error('Error fetching highest scorer counts:', error);
      res.status(500).json({ success: false, error: 'An error occurred while retrieving highest scorer counts.' });
  }
});

// Endpoint for Get Top Monthly Scores (all-time highest monthly scores)
router.get('/api/get-top-monthly-scores', requireLogin, async (req, res) => {
  logger.info('GET /api/get-top-monthly-scores');
  try {
    const limit = parseInt(req.query.limit, 10) || 3;
    const topScores = await Mastermind.getTopMonthlyScores(limit);
    res.json({ success: true, topScores });
  } catch (error) {
    logger.error('Error fetching top monthly scores:', error);
    res.status(500).json({ success: false, error: 'An error occurred while retrieving top monthly scores.' });
  }
});

// GET /api/get-earliest-date
router.get('/api/get-earliest-date', requireLogin, async (req, res) => {
  try {
      const earliestDate = await Mastermind.getEarliestDate(); // Delegate to the model
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

// GET /api/mastermind/hint-status - Get hint quota and today's hint if exists
router.get('/api/mastermind/hint-status', requireLogin, async (req, res) => {
    const userId = req.session.userId;
    logger.info(`GET /api/mastermind/hint-status for user ${userId}`);

    try {
        // Check if hint service is available
        if (!Mastermind.isHintServiceAvailable()) {
            return res.json({
                available: false,
                hintsRemaining: 0,
                totalHints: 0,
                todayHint: null
            });
        }

        const monthlyCount = await Mastermind.getMonthlyHintCount(userId);
        const todayHint = await Mastermind.getHintForToday(userId);

        res.json({
            available: true,
            hintsRemaining: Math.max(0, Mastermind.MONTHLY_HINT_LIMIT - monthlyCount),
            totalHints: Mastermind.MONTHLY_HINT_LIMIT,
            todayHint: todayHint
        });
    } catch (error) {
        logger.error('Error getting hint status:', error);
        res.status(500).json({ error: 'Failed to get hint status' });
    }
});

// POST /api/mastermind/request-hint - Request a new hint
router.post('/api/mastermind/request-hint', requireLogin, async (req, res) => {
    const userId = req.session.userId;
    logger.info(`POST /api/mastermind/request-hint for user ${userId}`);

    try {
        // Check if hint service is available
        if (!Mastermind.isHintServiceAvailable()) {
            return res.status(503).json({
                success: false,
                error: 'Hint service is not configured'
            });
        }

        const wordOfTheDay = await Mastermind.getWordOfTheDay();

        // Check if hint already requested today
        const existingHint = await Mastermind.getHintForToday(userId);
        if (existingHint) {
            const monthlyCount = await Mastermind.getMonthlyHintCount(userId);
            return res.json({
                success: true,
                hint: existingHint,
                hintsRemaining: Math.max(0, Mastermind.MONTHLY_HINT_LIMIT - monthlyCount),
                alreadyRequested: true
            });
        }

        // Check monthly quota
        const monthlyCount = await Mastermind.getMonthlyHintCount(userId);
        if (monthlyCount >= Mastermind.MONTHLY_HINT_LIMIT) {
            return res.status(403).json({
                success: false,
                error: 'Je hebt je maandelijkse limiet van hints bereikt',
                hintsRemaining: 0
            });
        }

        // Base the hint on the guesses stored on the server, not on what the
        // browser sends: otherwise anyone can fake a late-game state (whose
        // prompt contains the word itself) or slip instructions into the prompt.
        const gameState = await Mastermind.getUserGameState(userId);
        const guesses = gameState ? gameState.guesses : [];
        const feedback = gameState ? gameState.feedback : [];

        // Call Gemini API to get hint
        const hint = await Mastermind.generateHint(wordOfTheDay, guesses, feedback);

        // Save the hint
        await Mastermind.saveHint(userId, wordOfTheDay, hint);

        const newMonthlyCount = monthlyCount + 1;
        res.json({
            success: true,
            hint: hint,
            hintsRemaining: Math.max(0, Mastermind.MONTHLY_HINT_LIMIT - newMonthlyCount)
        });
    } catch (error) {
        logger.error('Error requesting hint:', error);
        res.status(500).json({
            success: false,
            error: 'Er ging iets mis bij het ophalen van de hint'
        });
    }
});

module.exports = router;
