//models/wieBenIk/questionsManager.js
const logger = require('../../logger');
const db = require('../db');
const gameManager = require('./gameManager');
const scoringManager = require('./scoringManager');

async function hasSubmittedQuestion(gameId, roundNumber, userId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT COUNT(*) AS cnt FROM wbi_questions
      WHERE game_id = ? AND round_number = ? AND user_id = ?
    `;
    db.get(sql, [gameId, roundNumber, userId], (err, row) => {
      if (err) return reject(err);
      resolve((row?.cnt || 0) > 0);
    });
  });
}

async function submitQuestion(gameId, userId, roundNumber, text, isGuess, llmAdvice) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO wbi_questions (game_id, user_id, round_number, text, is_guess, llm_advice)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.run(sql, [gameId, userId, roundNumber, text, isGuess ? 1 : 0, llmAdvice || null], function (err) {
      if (err) {
        logger.error('Wie ben ik: failed to insert question:', err.message);
        return reject(err);
      }
      logger.info(`Wie ben ik: question ${this.lastID} submitted by user ${userId} (game ${gameId}, round ${roundNumber}, guess: ${!!isGuess})`);
      resolve(this.lastID);
    });
  });
}

// All questions of a game with username and vote tallies.
async function getQuestionsWithVotes(gameId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT q.question_id, q.user_id, u.username, q.round_number, q.text, q.is_guess,
             q.llm_advice, q.created_at,
             SUM(CASE WHEN v.answer = 'ja' THEN 1 ELSE 0 END) AS ja,
             SUM(CASE WHEN v.answer = 'nee' THEN 1 ELSE 0 END) AS nee,
             SUM(CASE WHEN v.answer = '??' THEN 1 ELSE 0 END) AS onbekend
      FROM wbi_questions q
      JOIN users u ON q.user_id = u.id
      LEFT JOIN wbi_votes v ON v.question_id = q.question_id
      WHERE q.game_id = ?
      GROUP BY q.question_id
      ORDER BY q.round_number ASC, q.created_at ASC
    `;
    db.all(sql, [gameId], (err, rows) => {
      if (err) {
        logger.error('Wie ben ik: failed to fetch questions:', err.message);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

// Questions in the current round that this user still has to vote on
// (never the user's own question).
async function getQuestionsToVote(gameId, roundNumber, userId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT q.question_id, q.user_id, u.username, q.text, q.is_guess, q.llm_advice,
             p.character_name, p.character_description
      FROM wbi_questions q
      JOIN users u ON q.user_id = u.id
      JOIN wbi_players p ON p.game_id = q.game_id AND p.user_id = q.user_id
      WHERE q.game_id = ? AND q.round_number = ? AND q.user_id != ?
        AND NOT EXISTS (
          SELECT 1 FROM wbi_votes v WHERE v.question_id = q.question_id AND v.user_id = ?
        )
      ORDER BY q.created_at ASC
    `;
    db.all(sql, [gameId, roundNumber, userId, userId], (err, rows) => {
      if (err) {
        logger.error('Wie ben ik: failed to fetch questions to vote on:', err.message);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

async function getQuestionById(questionId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM wbi_questions WHERE question_id = ?`, [questionId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function submitVote(questionId, userId, answer) {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO wbi_votes (question_id, user_id, answer) VALUES (?, ?, ?)`;
    db.run(sql, [questionId, userId, answer], function (err) {
      if (err) {
        logger.error('Wie ben ik: failed to insert vote:', err.message);
        return reject(err);
      }
      logger.info(`Wie ben ik: user ${userId} voted '${answer}' on question ${questionId}`);
      resolve();
    });
  });
}

// When every player submitted a question this round, move to voting.
async function checkForEndOfQuestions(gameId) {
  const game = await gameManager.getGameById(gameId);
  if (!game || game.state !== 'question') return false;
  const players = await gameManager.getPlayers(gameId);

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT COUNT(DISTINCT user_id) AS cnt FROM wbi_questions
      WHERE game_id = ? AND round_number = ?
    `;
    db.get(sql, [gameId, game.current_round], async (err, row) => {
      if (err) return reject(err);
      if ((row?.cnt || 0) < players.length) return resolve(false);
      try {
        await gameManager.setGameState(gameId, 'voting');
        logger.info(`Wie ben ik: game ${gameId} round ${game.current_round} moved to voting.`);
        resolve(true);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// When every question in the round received a vote from every other player,
// resolve the round: a guess with more 'ja' than 'nee' votes wins the game;
// otherwise the next round starts.
async function checkForEndOfVoting(gameId) {
  const game = await gameManager.getGameById(gameId);
  if (!game || game.state !== 'voting') {
    return { roundEnded: false, gameCompleted: false };
  }
  const players = await gameManager.getPlayers(gameId);
  const expectedVotesPerQuestion = players.length - 1;

  const allQuestions = await getQuestionsWithVotes(gameId);
  const roundQuestions = allQuestions.filter(q => q.round_number === game.current_round);
  if (roundQuestions.length === 0) return { roundEnded: false, gameCompleted: false };

  const allVoted = roundQuestions.every(q => (q.ja + q.nee + q.onbekend) >= expectedVotesPerQuestion);
  if (!allVoted) return { roundEnded: false, gameCompleted: false };

  // Majority agrees that a guess is correct -> that player has won.
  const winners = roundQuestions
    .filter(q => q.is_guess && q.ja > q.nee)
    .map(q => q.user_id);

  if (winners.length > 0) {
    const completed = await gameManager.completeGame(gameId, winners);
    if (completed) {
      await scoringManager.updateScoring(gameId);
    }
    return { roundEnded: true, gameCompleted: true };
  }

  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE wbi_games SET current_round = current_round + 1, state = 'question' WHERE game_id = ? AND state = 'voting'`,
      [gameId],
      (err) => {
        if (err) {
          logger.error(`Wie ben ik: failed to advance round for game ${gameId}:`, err.message);
          return reject(err);
        }
        logger.info(`Wie ben ik: game ${gameId} advanced to round ${game.current_round + 1}.`);
        resolve({ roundEnded: true, gameCompleted: false });
      }
    );
  });
}

module.exports = {
  hasSubmittedQuestion,
  submitQuestion,
  getQuestionsWithVotes,
  getQuestionsToVote,
  getQuestionById,
  submitVote,
  checkForEndOfQuestions,
  checkForEndOfVoting
};
