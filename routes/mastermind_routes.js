// routes/mastermind_routes.js
// Mastermind, shown to players as "Woordle".

const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/authMiddleware');
const { servePage } = require('../utils/servePage');
const Mastermind = require('../models/mastermind');
const { todayNL, monthNL, addDays, isDateString, isMonthString } = require('../models/mastermind/dates');
const logger = require('../logger');

// Pages
router.get('/mastermind', requireLogin, servePage('mastermind.html'));
router.get('/mastermind/stats', requireLogin, servePage('mastermind-stats.html'));
router.get('/mastermind/compare', requireLogin, servePage('mastermind-compare.html'));
router.get('/mastermind/scoreboard', requireLogin, servePage('mastermind-scoreboard.html'));
router.get('/woordle', (req, res) => res.redirect('/mastermind'));

// Guesses of one player are handled one at a time, so two quick submits
// can't both pass the "6 guesses max" check.
const guessQueues = new Map(); // user_id -> promise of the guess being handled
function oneAtATime(userId, task) {
  const previous = guessQueues.get(userId) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  guessQueues.set(userId, current);
  current.finally(() => {
    if (guessQueues.get(userId) === current) guessQueues.delete(userId);
  }).catch(() => {});
  return current;
}

// The day a guess or game state is for: today's word (no date given), or
// yesterday's word being caught up. Any other date gives null.
function playableDate(requested) {
  const today = todayNL();
  if (requested === undefined || requested === today) return today;
  if (requested === addDays(today, -1)) return requested;
  return null;
}

// Validate Word Endpoint
router.post('/api/validate-word', requireLogin, async (req, res) => {
  const { word } = req.body;
  try {
    const isValid = await Mastermind.validateWord(word);
    res.json({ valid: isValid });
  } catch (error) {
    logger.error('Error validating word:', error);
    res.status(500).json({ error: 'Er is iets misgegaan.' });
  }
});

// Submit Guess Endpoint
router.post('/api/submit-guess', requireLogin, async (req, res) => {
  const { guess } = req.body;
  const user_id = req.session.userId;
  logger.info(`POST /api/submit-guess - User: ${user_id}`);

  try {
    const result = await oneAtATime(user_id, async () => {
      // The browser checks these too, but only the server can be trusted:
      // guesses must be real words, and at most until the puzzle is finished.
      if (!(await Mastermind.validateWord(guess))) {
        return { status: 400, body: { error: 'Dat woord kennen we niet.' } };
      }
      const date = playableDate(req.body.date);
      if (!date) {
        return { status: 400, body: { error: 'Dat woord kun je niet meer spelen.' } };
      }
      const gameState = await Mastermind.getUserGameState(user_id, date);
      if (gameState && gameState.finished) {
        const day = date === todayNL() ? 'vandaag' : 'gisteren';
        return { status: 400, body: { error: `Je hebt het woord van ${day} al gespeeld.` } };
      }
      const wordOfTheDay = await Mastermind.getWordOfTheDay(date);
      const feedback = Mastermind.generateFeedback(guess, wordOfTheDay);
      const correct = feedback.every(entry => entry === 'correct');
      await Mastermind.updateUserGuess(user_id, guess.toLowerCase(), feedback, wordOfTheDay, date);

      const guessCount = (gameState ? gameState.currentRow : 0) + 1;
      const finished = correct || guessCount >= Mastermind.MAX_GUESSES;
      logger.info(`User ${user_id} guess ${guessCount} processed - Correct: ${correct}`);
      // The answer is only revealed once the game is over
      return { status: 200, body: { correct, feedback, finished, answer: finished ? wordOfTheDay : undefined } };
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    logger.error('Error submitting guess:', error);
    res.status(500).json({ error: 'Je gok kon niet worden opgeslagen.' });
  }
});

// Load Game State Endpoint: today's game, or yesterday's with ?date=.
// catchUpDate is yesterday's date while this player can still catch it up;
// remindCatchUp says whether the home screen should point that out.
router.get('/api/load-game-state', requireLogin, async (req, res) => {
  const user_id = req.session.userId;
  const date = playableDate(req.query.date);
  if (!date) {
    return res.status(400).json({ success: false, error: 'Dat woord kun je niet meer spelen.' });
  }
  try {
    const gameState = await Mastermind.getUserGameState(user_id, date);
    const catchUpDate = await Mastermind.getCatchUpDate(user_id);
    const remindCatchUp = !!catchUpDate && await Mastermind.playedWeekBefore(user_id);
    if (gameState) {
      if (gameState.finished) {
        gameState.answer = await Mastermind.getWordOfTheDay(date);
      }
      res.json({ success: true, state: gameState, date, catchUpDate, remindCatchUp });
    } else {
      res.json({ success: false, message: 'No game state found.', date, catchUpDate, remindCatchUp });
    }
  } catch (error) {
    logger.error('Error loading game state:', error);
    res.status(500).json({ error: 'Er is iets misgegaan.' });
  }
});

router.get('/api/get-results', requireLogin, async (req, res) => {
  const user_id = req.session.userId;
  const date = req.query.date || todayNL();
  if (!isDateString(date)) {
    return res.status(400).json({ success: false, error: 'Ongeldige datum.' });
  }
  try {
    const userGameState = await Mastermind.getUserGameState(user_id, date);
    if (userGameState && userGameState.finished) {
      const results = await Mastermind.getAllResults(user_id, date);
      res.json({ success: true, results });
    } else {
      res.status(403).json({ success: false, message: 'Speel eerst zelf het woord van die dag.' });
    }
  } catch (error) {
    logger.error('Error getting results:', error);
    res.status(500).json({ error: 'Er is iets misgegaan.' });
  }
});

router.get('/api/get-stats', requireLogin, async (req, res) => {
  try {
    const stats = await Mastermind.getUserStats(req.session.userId);
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Error getting user stats:', error);
    res.status(500).json({ error: 'Er is iets misgegaan.' });
  }
});

// Scores per player for one month (default: the current Dutch month)
router.get('/api/get-monthly-scores', requireLogin, async (req, res) => {
  const month = req.query.month || monthNL();
  if (!isMonthString(month)) {
    return res.status(400).json({ success: false, error: 'Ongeldige maand.' });
  }
  try {
    const scores = await Mastermind.getMonthlyScores(month);
    res.json({ success: true, month, scores });
  } catch (error) {
    logger.error('Error fetching monthly scores:', error);
    res.status(500).json({ success: false, error: 'Er is iets misgegaan.' });
  }
});

// Winner(s) of last month
router.get('/api/get-previous-month-winner', requireLogin, async (req, res) => {
  try {
    const winner = await Mastermind.getPreviousMonthWinner();
    res.json({ success: true, ...winner });
  } catch (error) {
    logger.error('Error fetching previous month winner:', error);
    res.status(500).json({ success: false, error: 'Er is iets misgegaan.' });
  }
});

// Number of months won per player
router.get('/api/get-highest-scorer-counts', requireLogin, async (req, res) => {
  try {
    const highestScores = await Mastermind.getHighestScorerCounts();
    res.json({ success: true, highestScores });
  } catch (error) {
    logger.error('Error fetching highest scorer counts:', error);
    res.status(500).json({ success: false, error: 'Er is iets misgegaan.' });
  }
});

// All-time highest monthly scores
router.get('/api/get-top-monthly-scores', requireLogin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 3, 20);
    const topScores = await Mastermind.getTopMonthlyScores(limit);
    res.json({ success: true, topScores });
  } catch (error) {
    logger.error('Error fetching top monthly scores:', error);
    res.status(500).json({ success: false, error: 'Er is iets misgegaan.' });
  }
});

router.get('/api/get-earliest-date', requireLogin, async (req, res) => {
  try {
    const earliestDate = await Mastermind.getEarliestDate();
    if (earliestDate) {
      res.json({ success: true, earliestDate });
    } else {
      res.status(404).json({ success: false, message: 'Nog geen resultaten.' });
    }
  } catch (error) {
    logger.error('Error fetching earliest date:', error);
    res.status(500).json({ success: false, message: 'Er is iets misgegaan.' });
  }
});

// Hint quota and today's hint if there is one
router.get('/api/mastermind/hint-status', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  try {
    if (!Mastermind.isHintServiceAvailable()) {
      return res.json({ available: false, hintsRemaining: 0, totalHints: 0, todayHint: null });
    }
    const monthlyCount = await Mastermind.getMonthlyHintCount(userId);
    const todayHint = await Mastermind.getHintForToday(userId);
    res.json({
      available: true,
      hintsRemaining: Math.max(0, Mastermind.MONTHLY_HINT_LIMIT - monthlyCount),
      totalHints: Mastermind.MONTHLY_HINT_LIMIT,
      todayHint
    });
  } catch (error) {
    logger.error('Error getting hint status:', error);
    res.status(500).json({ error: 'Er is iets misgegaan.' });
  }
});

// Ask Ollie (Gemini) for a hint
router.post('/api/mastermind/request-hint', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  logger.info(`POST /api/mastermind/request-hint for user ${userId}`);

  try {
    if (!Mastermind.isHintServiceAvailable()) {
      return res.status(503).json({ success: false, error: 'Hints zijn nu niet beschikbaar.' });
    }

    const existingHint = await Mastermind.getHintForToday(userId);
    const monthlyCount = await Mastermind.getMonthlyHintCount(userId);
    if (existingHint) {
      return res.json({
        success: true,
        hint: existingHint,
        hintsRemaining: Math.max(0, Mastermind.MONTHLY_HINT_LIMIT - monthlyCount),
        alreadyRequested: true
      });
    }
    if (monthlyCount >= Mastermind.MONTHLY_HINT_LIMIT) {
      return res.status(403).json({
        success: false,
        error: 'Je hebt je hints voor deze maand al gebruikt.',
        hintsRemaining: 0
      });
    }

    // Base the hint on the guesses stored on the server, not on what the
    // browser sends: otherwise anyone can fake a late-game state (whose
    // prompt contains the word itself) or slip instructions into the prompt.
    const gameState = await Mastermind.getUserGameState(userId);
    if (gameState && gameState.finished) {
      return res.status(400).json({ success: false, error: 'Je bent al klaar met het woord van vandaag.' });
    }
    const wordOfTheDay = await Mastermind.getWordOfTheDay();
    const hint = await Mastermind.generateHint(wordOfTheDay, gameState ? gameState.guesses : [], gameState ? gameState.feedback : []);
    await Mastermind.saveHint(userId, wordOfTheDay, hint);

    res.json({
      success: true,
      hint,
      hintsRemaining: Math.max(0, Mastermind.MONTHLY_HINT_LIMIT - (monthlyCount + 1))
    });
  } catch (error) {
    logger.error('Error requesting hint:', error);
    res.status(500).json({ success: false, error: 'Er ging iets mis bij het ophalen van de hint.' });
  }
});

module.exports = router;
