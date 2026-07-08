// routes/wie_ben_ik_routes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const { requireLogin } = require('../middleware/authMiddleware');
const logger = require('../logger');

const WieBenIk = require('../models/wieBenIk');

// ----------------------
// Pages
// ----------------------
router.get('/wie-ben-ik', requireLogin, (req, res) => {
  logger.info(`GET /wie-ben-ik for user: ${req.session.userId}`);
  res.sendFile('wie-ben-ik.html', { root: path.join(__dirname, '../public/wie-ben-ik') });
});

router.get('/wie-ben-ik/scoreboard', requireLogin, (req, res) => {
  logger.info(`GET /wie-ben-ik/scoreboard for user: ${req.session.userId}`);
  res.sendFile('wie-ben-ik-scoreboard.html', { root: path.join(__dirname, '../public/wie-ben-ik') });
});

// ----------------------
// Load Game State (per-viewer projection)
// ----------------------
router.get('/api/wie-ben-ik/state', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  logger.info(`GET /api/wie-ben-ik/state for user: ${userId}`);
  try {
    let game = await WieBenIk.getActiveGame();
    if (!game || game.state === 'scoring') {
      if (game?.state === 'scoring') {
        return res.json({ game_id: game.game_id, state: 'scoring', status: 'completed' });
      }
      const Users = require('../models/user');
      const activeUsers = await Users.getActiveWieBenIkUserIds();
      logger.info(`Wie ben ik: active users: ${JSON.stringify(activeUsers)}`);
      if (!activeUsers || activeUsers.length < 2) {
        return res.json({ state: 'Off', reason: 'Niet genoeg spelers doen mee.' });
      }
      const newGameId = await WieBenIk.createNewGame(activeUsers);
      game = await WieBenIk.getGameById(newGameId);
    }

    const players = await WieBenIk.getPlayers(game.game_id);
    const me = players.find(p => p.user_id === userId);
    if (!me) {
      logger.info(`Wie ben ik: user ${userId} is not a participant. Returning Off state.`);
      return res.json({ game_id: game.game_id, state: 'Off', status: game.status });
    }

    // Safety net: run the phase checks so a stuck game recovers on any poll.
    if (game.state === 'theme_vote') {
      if (await WieBenIk.checkForEndOfThemeVote(game.game_id)) {
        game = await WieBenIk.getGameById(game.game_id);
      }
    } else if (game.state === 'question') {
      if (await WieBenIk.checkForEndOfQuestions(game.game_id)) {
        game = await WieBenIk.getGameById(game.game_id);
      }
    } else if (game.state === 'voting') {
      const result = await WieBenIk.checkForEndOfVoting(game.game_id);
      if (result.roundEnded) {
        game = await WieBenIk.getGameById(game.game_id);
      }
    }

    let viewState;
    switch (game.state) {
      case 'theme_vote':
        viewState = me.theme_vote ? 'theme-vote-waiting' : 'theme-vote';
        break;
      case 'question': {
        const submitted = await WieBenIk.hasSubmittedQuestion(game.game_id, game.current_round, userId);
        viewState = submitted ? 'question-waiting' : 'question';
        break;
      }
      case 'voting': {
        const toVote = await WieBenIk.getQuestionsToVote(game.game_id, game.current_round, userId);
        viewState = toVote.length > 0 ? 'voting' : 'voting-waiting';
        break;
      }
      case 'completed':
        viewState = 'scoring';
        break;
      default:
        viewState = 'idle';
        break;
    }

    res.json({
      game_id: game.game_id,
      state: viewState,
      status: game.status,
      round: game.current_round,
      theme_id: game.theme_id,
      theme_name: game.theme_name
    });
  } catch (error) {
    logger.error('Wie ben ik: error fetching game state:', error.stack || error);
    res.status(500).json({ error: 'Failed to fetch game state' });
  }
});

// ----------------------
// Themes (for the theme vote)
// ----------------------
router.get('/api/wie-ben-ik/themes', requireLogin, (req, res) => {
  try {
    res.json({ themes: WieBenIk.getThemes() });
  } catch (error) {
    logger.error('Wie ben ik: error fetching themes:', error.message);
    res.status(500).json({ error: 'Failed to fetch themes' });
  }
});

// ----------------------
// Submit Theme Vote
// ----------------------
router.post('/api/wie-ben-ik/theme-vote', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { theme_id } = req.body;
  logger.info(`POST /api/wie-ben-ik/theme-vote by user ${userId}: ${theme_id}`);
  try {
    if (!theme_id || !WieBenIk.isValidThemeId(theme_id)) {
      return res.status(400).json({ error: 'Ongeldig thema.' });
    }
    const game = await WieBenIk.getActiveGame();
    if (!game || game.state !== 'theme_vote') {
      return res.status(400).json({ error: 'Er is nu geen themastemming.' });
    }
    const players = await WieBenIk.getPlayers(game.game_id);
    if (!players.some(p => p.user_id === userId)) {
      return res.status(403).json({ error: 'Je doet niet mee met dit spel.' });
    }
    await WieBenIk.submitThemeVote(game.game_id, userId, theme_id);
    await WieBenIk.checkForEndOfThemeVote(game.game_id);
    res.json({ status: 'success' });
  } catch (error) {
    logger.error('Wie ben ik: error submitting theme vote:', error.message);
    res.status(500).json({ error: 'Failed to submit theme vote' });
  }
});

// ----------------------
// Players (own character stays hidden while the game is ongoing)
// ----------------------
router.get('/api/wie-ben-ik/players', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  try {
    const game = await WieBenIk.getActiveGame();
    if (!game || game.state === 'scoring') {
      return res.status(400).json({ error: 'Geen actief spel.' });
    }
    const players = await WieBenIk.getPlayers(game.game_id);
    if (!players.some(p => p.user_id === userId)) {
      return res.status(403).json({ error: 'Je doet niet mee met dit spel.' });
    }
    const safePlayers = players.map(p => {
      const isMe = p.user_id === userId;
      const hideCharacter = isMe && game.status === 'ongoing';
      return {
        user_id: p.user_id,
        username: p.username,
        is_me: isMe,
        has_voted_theme: !!p.theme_vote,
        character_name: hideCharacter ? null : p.character_name,
        character_description: hideCharacter ? null : p.character_description
      };
    });
    res.json({ players: safePlayers, theme_name: game.theme_name });
  } catch (error) {
    logger.error('Wie ben ik: error fetching players:', error.message);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// ----------------------
// Question/vote history (tallies only for resolved rounds)
// ----------------------
router.get('/api/wie-ben-ik/questions', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  try {
    const game = await WieBenIk.getActiveGame();
    if (!game || game.state === 'scoring') {
      return res.status(400).json({ error: 'Geen actief spel.' });
    }
    const players = await WieBenIk.getPlayers(game.game_id);
    if (!players.some(p => p.user_id === userId)) {
      return res.status(403).json({ error: 'Je doet niet mee met dit spel.' });
    }
    const questions = await WieBenIk.getQuestionsWithVotes(game.game_id);
    // Questions of the current round stay hidden until the viewer submitted
    // their own question (so nobody can lean on the others' questions first).
    const hasAskedThisRound = await WieBenIk.hasSubmittedQuestion(game.game_id, game.current_round, userId);
    const safeQuestions = questions.map(q => {
      // Vote counts become visible once the round is over.
      const resolved = q.round_number < game.current_round || game.status === 'completed';
      const isMine = q.user_id === userId;
      const hideText = !resolved && !isMine && !hasAskedThisRound && game.status === 'ongoing';
      return {
        question_id: q.question_id,
        user_id: q.user_id,
        username: q.username,
        is_mine: isMine,
        round_number: q.round_number,
        text: hideText ? '***' : q.text,
        is_guess: hideText ? false : !!q.is_guess,
        resolved,
        ja: resolved ? q.ja : null,
        nee: resolved ? q.nee : null,
        onbekend: resolved ? q.onbekend : null
      };
    });
    res.json({ questions: safeQuestions, current_round: game.current_round });
  } catch (error) {
    logger.error('Wie ben ik: error fetching questions:', error.message);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// ----------------------
// Submit a Question (or a guess)
// ----------------------
router.post('/api/wie-ben-ik/question', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { text, is_guess } = req.body;
  logger.info(`POST /api/wie-ben-ik/question by user ${userId} (guess: ${!!is_guess})`);
  try {
    const questionText = (text || '').trim();
    if (!questionText) {
      return res.status(400).json({ error: 'Je hebt niks ingevuld.' });
    }
    const game = await WieBenIk.getActiveGame();
    if (!game || game.state !== 'question') {
      return res.status(400).json({ error: 'Je kunt nu geen vraag stellen.' });
    }
    const players = await WieBenIk.getPlayers(game.game_id);
    const me = players.find(p => p.user_id === userId);
    if (!me) {
      return res.status(403).json({ error: 'Je doet niet mee met dit spel.' });
    }
    const alreadySubmitted = await WieBenIk.hasSubmittedQuestion(game.game_id, game.current_round, userId);
    if (alreadySubmitted) {
      return res.status(400).json({ error: 'Je hebt deze ronde al een vraag gesteld.' });
    }

    // For a guess, ask the LLM to compare the guess with the real character
    // so voters get a suggestion. On failure the game continues without one.
    let llmAdvice = null;
    if (is_guess && me.character_name) {
      llmAdvice = await WieBenIk.judgeGuess(me.character_name, me.character_description, questionText);
    }

    await WieBenIk.submitQuestion(game.game_id, userId, game.current_round, questionText, is_guess, llmAdvice);
    await WieBenIk.checkForEndOfQuestions(game.game_id);
    res.json({ status: 'success' });
  } catch (error) {
    logger.error('Wie ben ik: error submitting question:', error.message);
    res.status(500).json({ error: 'Failed to submit question' });
  }
});

// ----------------------
// Questions the user still has to vote on
// ----------------------
router.get('/api/wie-ben-ik/to-vote', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  try {
    const game = await WieBenIk.getActiveGame();
    if (!game || game.state !== 'voting') {
      return res.json({ questions: [] });
    }
    const players = await WieBenIk.getPlayers(game.game_id);
    if (!players.some(p => p.user_id === userId)) {
      return res.status(403).json({ error: 'Je doet niet mee met dit spel.' });
    }
    const questions = await WieBenIk.getQuestionsToVote(game.game_id, game.current_round, userId);
    res.json({
      questions: questions.map(q => ({
        question_id: q.question_id,
        username: q.username,
        character_name: q.character_name,
        character_description: q.character_description,
        text: q.text,
        is_guess: !!q.is_guess,
        llm_advice: q.is_guess ? q.llm_advice : null
      }))
    });
  } catch (error) {
    logger.error('Wie ben ik: error fetching questions to vote on:', error.message);
    res.status(500).json({ error: 'Failed to fetch questions to vote on' });
  }
});

// ----------------------
// Submit a Vote
// ----------------------
router.post('/api/wie-ben-ik/vote', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { question_id, answer } = req.body;
  logger.info(`POST /api/wie-ben-ik/vote by user ${userId} on question ${question_id}: ${answer}`);
  try {
    if (!['ja', 'nee', '??'].includes(answer)) {
      return res.status(400).json({ error: 'Ongeldig antwoord.' });
    }
    const game = await WieBenIk.getActiveGame();
    if (!game || game.state !== 'voting') {
      return res.status(400).json({ error: 'Er valt nu niks te stemmen.' });
    }
    const players = await WieBenIk.getPlayers(game.game_id);
    if (!players.some(p => p.user_id === userId)) {
      return res.status(403).json({ error: 'Je doet niet mee met dit spel.' });
    }
    const question = await WieBenIk.getQuestionById(question_id);
    if (!question || question.game_id !== game.game_id || question.round_number !== game.current_round) {
      return res.status(400).json({ error: 'Ongeldige vraag.' });
    }
    if (question.user_id === userId) {
      return res.status(400).json({ error: 'Je kunt niet op je eigen vraag stemmen.' });
    }
    await WieBenIk.submitVote(question_id, userId, answer);
    await WieBenIk.checkForEndOfVoting(game.game_id);
    res.json({ status: 'success' });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Je hebt al gestemd op deze vraag.' });
    }
    logger.error('Wie ben ik: error submitting vote:', error.message);
    res.status(500).json({ error: 'Failed to submit vote' });
  }
});

// ----------------------
// Scoreboard endpoints
// ----------------------
router.get('/api/wie-ben-ik/last-game-score', requireLogin, async (req, res) => {
  logger.info(`GET /api/wie-ben-ik/last-game-score for user: ${req.session.userId}`);
  try {
    const lastGameId = await WieBenIk.getLatestGameId();
    if (!lastGameId) {
      return res.json({ success: false, message: 'Geen score beschikbaar' });
    }
    const game = await WieBenIk.getGameById(lastGameId);

    let winners = [];
    try { winners = JSON.parse(game.winners || '[]'); } catch (e) { /* ignore */ }
    const players = await WieBenIk.getPlayers(lastGameId);
    const winnerNames = players.filter(p => winners.includes(p.user_id)).map(p => p.username);

    res.json({
      success: true,
      game_id: lastGameId,
      theme_name: game.theme_name,
      round: game.current_round,
      winners: winnerNames
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/wie-ben-ik/monthly-scores', requireLogin, async (req, res) => {
  logger.info(`GET /api/wie-ben-ik/monthly-scores for user: ${req.session.userId}`);
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
    const scores = await WieBenIk.getMonthlyWinCounts(currentMonth);
    res.json({ success: true, scores });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/wie-ben-ik/total-scores', requireLogin, async (req, res) => {
  logger.info(`GET /api/wie-ben-ik/total-scores for user: ${req.session.userId}`);
  try {
    const scores = await WieBenIk.getTotalWinCounts();
    res.json({ success: true, scores });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/wie-ben-ik/previous-month-winner', requireLogin, async (req, res) => {
  logger.info(`GET /api/wie-ben-ik/previous-month-winner for user: ${req.session.userId}`);
  try {
    const winner = await WieBenIk.getPreviousMonthWinner();
    if (winner) {
      res.json({ success: true, winner: winner.username, wins: winner.wins });
    } else {
      res.json({ success: false, message: 'Geen winnaar' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ----------------------
// Past game (full replay, all characters visible)
// ----------------------
router.get('/api/wie-ben-ik/get-game', requireLogin, async (req, res) => {
  const { game_id } = req.query;
  if (!game_id) return res.status(400).json({ error: 'Missing game_id parameter' });
  logger.info(`GET /api/wie-ben-ik/get-game for user: ${req.session.userId} with game_id: ${game_id}`);
  try {
    const game = await WieBenIk.getGameById(game_id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'completed') {
      return res.status(403).json({ error: 'Dit spel is nog bezig.' });
    }

    const players = await WieBenIk.getPlayers(game_id);
    const questions = await WieBenIk.getQuestionsWithVotes(game_id);
    let winners = [];
    try { winners = JSON.parse(game.winners || '[]'); } catch (e) { /* ignore */ }

    res.json({
      game_id: game.game_id,
      date: game.created_at,
      theme_name: game.theme_name,
      rounds: game.current_round,
      winners: players.filter(p => winners.includes(p.user_id)).map(p => p.username),
      players: players.map(p => ({
        user_id: p.user_id,
        username: p.username,
        character_name: p.character_name,
        character_description: p.character_description,
        is_winner: winners.includes(p.user_id)
      })),
      questions: questions.map(q => ({
        question_id: q.question_id,
        user_id: q.user_id,
        username: q.username,
        round_number: q.round_number,
        text: q.text,
        is_guess: !!q.is_guess,
        llm_advice: q.is_guess ? q.llm_advice : null,
        ja: q.ja,
        nee: q.nee,
        onbekend: q.onbekend
      })),
      prev_game_id: await WieBenIk.getPreviousGameId(game_id),
      next_game_id: await WieBenIk.getNextGameId(game_id)
    });
  } catch (error) {
    logger.error('Wie ben ik: error fetching past game:', error.message);
    res.status(500).json({ error: 'Failed to fetch past game' });
  }
});

module.exports = router;
