// routes/games.js

const express = require('express');
const router = express.Router();
const path = require('path');
const { requireLogin } = require('../middleware/authMiddleware');
const gameResults = require('../models/gameResults'); // Assuming this module handles game data storage
const wordsService = require('../models/wordsService'); // Assuming this module handles word validation and word of the day


// Mastermind Game Page
router.get('/mastermind', requireLogin, (req, res) => {
  res.sendFile('mastermind.html', { root: path.join(__dirname, '../public') });
});

router.get('/mastermind/stats', requireLogin, (req, res) => {
    res.sendFile('mastermind-stats.html', { root: path.join(__dirname, '../public') });
});

router.get('/mastermind/compare', requireLogin, (req, res) => {
    res.sendFile('mastermind-compare.html', { root: path.join(__dirname, '../public') });
});



// Validate Word Endpoint
router.post('/api/validate-word', requireLogin, async (req, res) => {
    const { word } = req.body;
    try {
        const isValid = await wordsService.validateWord(word);
        res.json({ valid: isValid });
    } catch (error) {
        console.error('Error validating word:', error);
        res.status(500).send('An error occurred while validating the word.');
    }
});

// Submit Guess Endpoint
router.post('/api/submit-guess', requireLogin, async (req, res) => {
    const { guess } = req.body;
    console.log('Guess:', guess);
    const user_id = req.session.userId;
    try {
        if (!guess) {
            return res.status(400).json({ error: 'Guess is required.' });
          }
        const wordOfTheDay = await wordsService.getWordOfTheDay();
        console.log('Word of the day:', wordOfTheDay);
        console.log('Guess:', guess);
        const feedback = generateFeedback(guess, wordOfTheDay);

        // Check if the guess is correct
        const correct = feedback.every((entry) => entry === 'correct');

        // Update game results for the user
        await gameResults.updateUserGuess(user_id, guess, feedback, wordOfTheDay);

        res.json({ correct, feedback });
    } catch (error) {
        console.error('Error submitting guess:', error);
        res.status(500).send('An error occurred while submitting the guess.');
    }
});

// Load Game State Endpoint
router.get('/api/load-game-state', requireLogin, async (req, res) => {
    const user_id = req.session.userId;
    console.log('User ID:', user_id);
    try {
      const gameState = await gameResults.getUserGameState(user_id);
      if (gameState) {
        res.json({ success: true, state: gameState });
      } else {
        res.json({ success: false, message: 'No game state found.' });
      }
    } catch (error) {
      console.error('Error loading game state:', error);
      res.status(500).send('An error occurred while loading the game state.');
    }
  });

// Helper function to generate feedback for the guess
function generateFeedback(guess, wordOfTheDay) {
    if (!guess || !wordOfTheDay || guess.length !== wordOfTheDay.length) {
        throw new Error('Invalid guess or word of the day. They must be non-empty and of equal length.');
      }
    
    const feedback = [];
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] === wordOfTheDay[i]) {
        feedback.push('correct');
      } else if (wordOfTheDay.includes(guess[i])) {
        feedback.push('misplaced');
      } else {
        feedback.push('incorrect');
      }
    }
    return feedback;
  }
  

module.exports = router;
