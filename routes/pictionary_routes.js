// routes/pictionary_routes.js
const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/authMiddleware');
const { servePage } = require('../utils/servePage');
const logger = require('../logger');
const Users = require('../models/user');

const Pictionary = require('../models/pictionary');

// games.guessers is stored as a JSON string like "[2,3]": parse it instead of
// searching the string, so user 1 doesn't count as a guesser in "[10,12]".
function isGuesser(gameState, userId) {
  try {
    return JSON.parse(gameState.guessers || '[]').includes(userId);
  } catch (error) {
    return false;
  }
}

// Loads the one active game into req.game, or answers 400 when there is none
async function requireActiveGame(req, res, next) {
  try {
    const game = await Pictionary.getActiveGame();
    if (!game || game.state === 'scoring') {
      return res.status(400).json({ error: 'Er is nu geen spel bezig.' });
    }
    req.game = game;
    next();
  } catch (error) {
    next(error);
  }
}

function requireDrawer(req, res, next) {
  if (req.game.drawer_user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Alleen de tekenaar kan dit doen.' });
  }
  next();
}

// Errors thrown with a status (e.g. "time is up") are shown to the player;
// anything else is logged and answered with a general message.
function sendError(res, error, context) {
  if (error.status) {
    return res.status(error.status).json({ error: error.message });
  }
  logger.error(`${context}:`, error);
  res.status(500).json({ error: 'Er is iets misgegaan.' });
}

// A drawer who left while drawing (or touching up) would block the game
// forever: once the deadline has long passed, move the game along.
async function resolveAbandonedTurn(game) {
  const deadlinePassed = Pictionary.isPastDeadline(game.drawing_completed_at, Pictionary.ABANDON_AFTER_MS);
  if (game.state === 'drawing' && deadlinePassed) {
    logger.info(`Game ${game.game_id}: drawing time ran out without a drawing, ending the game.`);
    await Pictionary.handleEmptyDrawing(game.game_id);
    return true;
  }
  if (game.state === 'modify' && deadlinePassed) {
    logger.info(`Game ${game.game_id}: touch-up time ran out, back to grading.`);
    await Pictionary.setGameState(game.game_id, 'feedback');
    return true;
  }
  return false;
}


// Pictionary Game Page
router.get('/pictionary', requireLogin, servePage('pictionary/pictionary.html'));

// Scoreboard Page
router.get('/pictionary/scoreboard', requireLogin, servePage('pictionary/pictionary-scoreboard.html'));

// ----------------------
// Last game page
// ----------------------
router.get('/api/pictionary/get-game', requireLogin, async (req, res) => {
  const { game_id } = req.query;
  if (!game_id) return res.status(400).json({ error: "Missing game_id parameter" });
  logger.info(`GET /api/pictionary/get-game for user: ${req.session.userId} with game_id: ${game_id}`);

  try {
      const gameData = await Pictionary.getGameById(game_id);
      if (!gameData) return res.status(404).json({ error: "Game not found" });
      // The word of the game that is still being played must stay secret.
      if (gameData.status === 'ongoing') {
          return res.status(403).json({ error: 'Dit spel is nog bezig.' });
      }

      const drawer = await Users.getUsernameById(gameData.drawer_user_id);
      let guesses = await Pictionary.getGuesses(game_id);

      // Add navigation logic
      const prevGame = await Pictionary.getPreviousGameId(game_id);
      const nextGame = await Pictionary.getNextGameId(game_id);

      guesses = await Promise.all(guesses.map(async guess => {
        logger.info(`Fetching username for user ${guess.user_id}`);
        const username = await Users.getUsernameById(guess.user_id);
        return { ...guess, username };
      }));
  
      logger.info(`Game data fetched for game ${game_id}`);
      res.json({
          game_id,
          date: gameData.created_at,
          word: gameData.word,
          difficulty: gameData.difficulty,
          drawer,
          imageSrc: gameData.image_path,
          guesses,
          prev_game_id: prevGame,
          next_game_id: nextGame
      });
  } catch (error) {
      logger.error("Error fetching past game:", error);
      res.status(500).json({ error: "Failed to fetch past game" });
  }
});

// ----------------------
// Scores page
// ----------------------

// Get last game score
router.get('/api/pictionary/last-game-score', requireLogin, async (req, res) => {
  logger.info(`GET /api/pictionary/last-game-score for user: ${req.session.userId}`);
  try {
      const lastGameId = await Pictionary.getLatestGameId();
      logger.info(`Last game ID: ${lastGameId}`);
      //if lastGameId not null run 
      if (!lastGameId) {
          return res.json({ success: false, message: 'Geen score beschikbaar' });
      }

      const gameState = await Pictionary.getGameById(lastGameId);
      const drawer_user_id = gameState.drawer_user_id;
      const drawer_username = await Users.getUsernameById(drawer_user_id);
      const word = gameState.word;
      const lastGameScore = await Pictionary.getGameScore(lastGameId);
      logger.info(`Last game score: ${JSON.stringify(lastGameScore)}`);
      if (lastGameScore) {
          res.json({ success: true, score: lastGameScore, word: word, drawer: drawer_username, game_id: lastGameId });
      } else {
          res.json({ success: false, message: 'Geen score beschikbaar' });
      }
  } catch (error) {
      logger.error(`Error in ${req.method} ${req.path}: ${error.message}`);
      res.status(500).json({ success: false, error: 'Er is iets misgegaan.' });
  }
});

// Get monthly scores
router.get('/api/pictionary/monthly-scores', requireLogin, async (req, res) => {
  logger.info(`GET /api/pictionary/monthly-scores for user: ${req.session.userId}`);
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
      const scores = await Pictionary.getMonthlyScores(currentMonth);
      res.json({ success: true, scores });
  } catch (error) {
      logger.error(`Error in ${req.method} ${req.path}: ${error.message}`);
      res.status(500).json({ success: false, error: 'Er is iets misgegaan.' });
  }
});

// Get last month's winner
router.get('/api/pictionary/previous-month-winner', requireLogin, async (req, res) => {
  logger.info(`GET /api/pictionary/previous-month-winner for user: ${req.session.userId}`);
  try {
      const winner = await Pictionary.getPreviousMonthWinner();
      if (winner) {
          res.json({ success: true, winner: winner.username, score: winner.score });
      } else {
          res.json({ success: false, message: 'Geen winnaar' });
      }
  } catch (error) {
      logger.error(`Error in ${req.method} ${req.path}: ${error.message}`);
      res.status(500).json({ success: false, error: 'Er is iets misgegaan.' });
  }
});


// ----------------------
// Load Game State
// ----------------------
router.get('/api/pictionary/state', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  try {
    let gameState = await Pictionary.getActiveGame();
    if (gameState && gameState.status === 'ongoing' && await resolveAbandonedTurn(gameState)) {
      gameState = await Pictionary.getActiveGame();
    }
    if (!gameState || gameState.state === 'scoring') {
      if (gameState?.state === 'scoring') {
        return res.json({ game_id: gameState.game_id, state: 'scoring', status: 'completed' });
      }
      const activeUsers = await Users.getActivePictionaryUserIds();
      if (!activeUsers || activeUsers.length < 2) {
        return res.json({ state: 'Off', reason: 'not-enough-players' });
      }
      const newGameId = await Pictionary.createNewGame(activeUsers);
      logger.info(`New Pictionary game ${newGameId} created.`);
      gameState = await Pictionary.getGameById(newGameId);
      Pictionary.notifyNewGame(gameState, userId);
    }
    const gameId = gameState.game_id;
    const isDrawer = gameState.drawer_user_id === userId;

    // Players are the drawer and the guessers; everyone else is told the game is "Off" for them
    if (!isDrawer && !isGuesser(gameState, userId)) {
      return res.json({ game_id: gameId, state: 'Off', status: gameState.status, drawer_name: gameState.drawer_name });
    }

    if (gameState.state === 'guessing') {
      if (await Pictionary.checkForEndOfGuessing(gameId, userId)) {
        gameState.state = 'feedback';
      }
    }

    // Per-viewer projection of the shared state: the word and the drawing in
    // progress must only reach the drawer.
    let state = gameState.state;
    if (!isDrawer) {
      if (['choose', 'thinking', 'drawing'].includes(state)) {
        state = 'idle';
      } else if (state === 'feedback' || state === 'modify') {
        state = 'guessing-watching';
      } else if (state === 'guessing') {
        const lastRoundForUser = await Pictionary.getRoundNumber(gameId, userId);
        if (lastRoundForUser >= gameState.current_round) state = 'guessing-watching';
      }
    } else if (state === 'guessing') {
      state = 'guessing-watching'; // the drawer watches while the others guess
    }

    const safeGameState = {
      game_id: gameId,
      state,
      status: gameState.status,
      difficulty: gameState.difficulty,
      round: gameState.current_round,
      drawer_name: gameState.drawer_name,
      is_drawer: isDrawer
    };
    // The drawer gets the word while thinking about the drawing
    if (state === 'thinking' && isDrawer) {
      safeGameState.word = gameState.word;
    }
    res.json(safeGameState);
  } catch (error) {
    logger.error('Error fetching game state:', error);
    res.status(500).json({ error: 'Er is iets misgegaan.' });
  }
});

// ----------------------
// Get Max Score
// ----------------------
router.get('/api/pictionary/max-scores', requireLogin, async (req, res) => {
  try {
    res.json({
      easy: await Pictionary.getMaxScore('easy'),
      medium: await Pictionary.getMaxScore('medium'),
      hard: await Pictionary.getMaxScore('hard')
    });
  } catch (error) {
    logger.error('Error fetching max scores:', error);
    res.status(500).json({ error: 'Er is iets misgegaan.' });
  }
});

// ----------------------
// Set Difficulty (drawer, 'choose' phase only: the response contains the word)
// ----------------------
router.post('/api/pictionary/set-difficulty', requireLogin, requireActiveGame, requireDrawer, async (req, res) => {
  const { difficulty } = req.body;
  const game = req.game;
  try {
    if (game.state !== 'choose') {
      return res.status(400).json({ error: 'Je kunt nu geen moeilijkheid kiezen.' });
    }
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return res.status(400).json({ error: 'Onbekende moeilijkheid.' });
    }
    const maxPoints = await Pictionary.getMaxScore(difficulty);
    const word = Pictionary.getRandomPictionaryWord(difficulty);
    await Pictionary.setChosenWord(game.game_id, word);
    await Pictionary.setDifficulty(game.game_id, difficulty);
    await Pictionary.setGameState(game.game_id, 'thinking');
    logger.info(`Game ${game.game_id}: difficulty ${difficulty} chosen`);
    res.json({ word, game_id: game.game_id, state: 'thinking', maxPoints });
  } catch (error) {
    sendError(res, error, 'Error setting difficulty');
  }
});

// ----------------------
// Get Image (Drawing)
// ----------------------
router.get('/api/pictionary/get-image', requireLogin, requireActiveGame, async (req, res) => {
  const game = req.game;
  if (!['guessing', 'feedback', 'modify'].includes(game.state)) {
    return res.status(400).json({ error: 'Er is nog geen tekening.' });
  }
  const result = { drawerName: game.drawer_name, imageSrc: game.image_path, difficulty: game.difficulty, round: game.current_round };
  if (game.drawer_user_id === req.session.userId) {
    result.word = game.word;
  }
  res.json(result);
});

// ----------------------
// Get Guesses
// ----------------------
router.get('/api/pictionary/get-guesses', requireLogin, requireActiveGame, async (req, res) => {
  const userId = req.session.userId;
  const game = req.game;
  try {
    let guesses = await Pictionary.getGuesses(game.game_id);
    const lastRoundForUser = await Pictionary.getRoundNumber(game.game_id, userId);

    // Guesses of the current round stay hidden until you've guessed yourself
    if (game.drawer_user_id !== userId && lastRoundForUser < game.current_round) {
      guesses = guesses.map(guess => (guess.round_number === game.current_round ? { ...guess, text: '***' } : guess));
    }
    guesses = await Promise.all(guesses.map(async guess => ({ ...guess, username: await Users.getUsernameById(guess.user_id) })));
    res.json({ guesses });
  } catch (error) {
    sendError(res, error, 'Error fetching guesses');
  }
});

// ----------------------
// Submit a Guess
// ----------------------
router.post('/api/pictionary/submit-guess', requireLogin, requireActiveGame, async (req, res) => {
  const userId = req.session.userId;
  const { guess } = req.body;
  const game = req.game;
  try {
    if (game.state !== 'guessing') {
      return res.status(400).json({ error: 'Je kunt nu niet raden.' });
    }
    if (!isGuesser(game, userId)) {
      return res.status(403).json({ error: 'Je doet niet mee met dit spel.' });
    }
    // Guesses are sent to every player on each poll, so keep them short text
    if (typeof guess !== 'string' || guess.trim() === '' || guess.length > 200) {
      return res.status(400).json({ error: 'Vul een gok in (maximaal 200 tekens).' });
    }
    const roundForUser = (await Pictionary.getRoundNumber(game.game_id, userId)) + 1;
    if (roundForUser > game.current_round) {
      return res.status(400).json({ error: 'Je hebt deze ronde al geraden.' });
    }
    await Pictionary.submitGuess(game.game_id, userId, roundForUser, guess.trim());
    logger.info(`Game ${game.game_id}: user ${userId} guessed in round ${roundForUser}`);
    res.json({ status: 'success' });
  } catch (error) {
    sendError(res, error, 'Error submitting guess');
  }
});

// ----------------------
// Fetch Guesses to Grade
// ----------------------
router.get('/api/pictionary/get-guesses-to-grade', requireLogin, requireActiveGame, requireDrawer, async (req, res) => {
  const game = req.game;
  try {
    if (game.state !== 'feedback') {
      return res.status(400).json({ error: 'Er valt nu niets te beoordelen.' });
    }
    let guessesToGrade = await Pictionary.getGuessesToGrade(game.game_id, game.current_round);

    // Ask the LLM for suggested grades; grading works without them if this fails.
    const suggestedGrades = await Pictionary.suggestGrades(game.word, guessesToGrade);
    guessesToGrade = guessesToGrade.map(guess => ({ ...guess, suggested_grade: suggestedGrades.get(guess.action_id) ?? null }));

    const hasModified = await Pictionary.hasModifiedDrawing(game.game_id, game.current_round);
    res.json({ guesses: guessesToGrade, canModify: !hasModified, word: game.word });
  } catch (error) {
    sendError(res, error, 'Error fetching guesses to grade');
  }
});

// ----------------------
// Submit Grades
// ----------------------
router.post('/api/pictionary/submit-grades', requireLogin, requireActiveGame, requireDrawer, async (req, res) => {
  const { feedback } = req.body; // array of { action_id, feedback }
  const game = req.game;
  const gameId = game.game_id;
  try {
    if (game.state !== 'feedback') {
      logger.warn(`Submit-grades for game ${gameId} in state '${game.state}' (duplicate or late call).`);
      return res.status(400).json({ error: 'Er valt nu niets te beoordelen.' });
    }
    if (Array.isArray(feedback) && feedback.length > 0) {
      // Grades are shown to every player, so only accept the numbers 1-5
      const allValid = feedback.every(grade =>
        grade && Number.isInteger(grade.feedback) && grade.feedback >= 1 && grade.feedback <= 5);
      if (!allValid) {
        return res.status(400).json({ error: 'Ongeldig cijfer.' });
      }
      for (const grade of feedback) {
        await Pictionary.submitFeedback(grade.action_id, grade.feedback, gameId, game.current_round);
      }
    }

    const feedbackResult = await Pictionary.checkForEndOfFeedback(gameId); // { roundEnded, gameCompleted }
    if (feedbackResult.roundEnded) {
      if (feedbackResult.gameCompleted) {
        await Pictionary.updateScoring(gameId);
        logger.info(`Game ${gameId} is now completed.`);
        Pictionary.notifyResult(game, await Pictionary.getGuesses(gameId), req.session.userId);
      } else {
        await Pictionary.setGameState(gameId, 'guessing');
        logger.info(`Game ${gameId} advanced to round ${game.current_round + 1}.`);
        Pictionary.notifyGuessers(game, game.current_round + 1, req.session.userId);
      }
    }
    const updated = await Pictionary.getGameById(gameId);
    res.json({ status: 'success', newState: updated.state });
  } catch (error) {
    sendError(res, error, `Error submitting grades for game ${gameId}`);
  }
});

// ----------------------
// Start Drawing (starts the timer, or returns the time left after a reload)
// ----------------------
router.post('/api/pictionary/start-drawing', requireLogin, requireActiveGame, requireDrawer, async (req, res) => {
  const game = req.game;
  try {
    if (game.state === 'drawing' && game.drawing_completed_at) {
      return res.json({
        countdown: Pictionary.secondsLeft(game.drawing_completed_at),
        endsAt: game.drawing_completed_at,
        word: game.word,
        round: game.current_round
      });
    }
    if (game.state !== 'thinking') {
      return res.status(400).json({ error: 'Je kunt nu niet beginnen met tekenen.' });
    }
    const { countdown, endsAt } = await Pictionary.startDrawing(game.game_id);
    res.json({ countdown, endsAt, word: game.word, round: game.current_round });
  } catch (error) {
    sendError(res, error, 'Error starting drawing timer');
  }
});

// ----------------------
// Submit Drawing
// ----------------------
router.post('/api/pictionary/submit-drawing', requireLogin, requireActiveGame, requireDrawer, async (req, res) => {
  const { drawing, empty } = req.body;
  const game = req.game;
  try {
    // Nothing drawn: the game ends without points and a new one starts
    if (empty === true) {
      if (game.state !== 'drawing') {
        return res.status(400).json({ error: 'Er wordt nu niet getekend.' });
      }
      logger.info(`Game ${game.game_id}: empty drawing, ending the game.`);
      await Pictionary.handleEmptyDrawing(game.game_id);
      return res.json({ status: 'empty' });
    }
    const filePath = await Pictionary.saveDrawing(game.game_id, drawing);
    logger.info(`Game ${game.game_id}: drawing submitted`);
    Pictionary.notifyGuessers(game, game.current_round, req.session.userId);
    res.json({ status: 'success', filePath });
  } catch (error) {
    sendError(res, error, 'Error submitting drawing');
  }
});

// ----------------------
// Enter Modify State (one touch-up per round, while grading)
// ----------------------
router.post('/api/pictionary/enter-modify-state', requireLogin, requireActiveGame, requireDrawer, async (req, res) => {
  const game = req.game;
  try {
    if (game.state === 'feedback') {
      if (await Pictionary.hasModifiedDrawing(game.game_id, game.current_round)) {
        return res.status(400).json({ error: 'Je hebt de tekening deze ronde al aangepast.' });
      }
    } else if (game.state !== 'modify') {
      return res.status(400).json({ error: 'Je kunt de tekening nu niet aanpassen.' });
    }
    const { countdown, endsAt } = await Pictionary.startModification(game);
    res.json({ countdown, endsAt, word: game.word, image_src: game.image_path, round: game.current_round });
  } catch (error) {
    sendError(res, error, 'Error entering modify state');
  }
});

// ----------------------
// Submit Modified Drawing
// ----------------------
router.post('/api/pictionary/submit-modified-drawing', requireLogin, requireActiveGame, requireDrawer, async (req, res) => {
  const game = req.game;
  try {
    if (game.state !== 'modify') {
      return res.status(400).json({ error: 'Je bent de tekening nu niet aan het aanpassen.' });
    }
    const filePath = await Pictionary.saveModifiedDrawing(game, req.body.drawing);
    res.json({ status: 'success', filePath });
  } catch (error) {
    sendError(res, error, 'Error submitting modified drawing');
  }
});

module.exports = router;
