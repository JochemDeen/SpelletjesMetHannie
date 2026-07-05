//models/wieBenIk/scoringManager.js
const logger = require('../../logger');
const db = require('../db');

// Points for the winner(s), indexed by round the game was won in (round 1 = 20).
const WINNER_POINTS = [20, 18, 16, 14, 12, 10];

function getWinnerPoints(round) {
  const index = Math.min(Math.max(round, 1) - 1, WINNER_POINTS.length - 1);
  return WINNER_POINTS[index];
}

// Persists scores for a completed game: winners get round-based points,
// all other players a 0 entry so they show up on the scoreboard.
async function updateScoring(gameId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM wbi_games WHERE game_id = ?`, [gameId], (err, game) => {
      if (err) {
        logger.error('Wie ben ik: error fetching game for scoring:', err.message);
        return reject(err);
      }
      if (!game) return reject(new Error(`Game ${gameId} not found`));
      if (game.status !== 'completed') {
        logger.warn(`Wie ben ik: game ${gameId} is not completed. Skipping scoring.`);
        return resolve(false);
      }

      let winners = [];
      try {
        winners = JSON.parse(game.winners || '[]');
      } catch (parseErr) {
        logger.warn(`Wie ben ik: could not parse winners for game ${gameId}: ${parseErr.message}`);
      }
      const points = getWinnerPoints(game.current_round);

      db.all(`SELECT user_id FROM wbi_players WHERE game_id = ?`, [gameId], (err2, players) => {
        if (err2) {
          logger.error('Wie ben ik: error fetching players for scoring:', err2.message);
          return reject(err2);
        }

        const insertSql = `INSERT INTO wbi_scores (user_id, game_id, score) VALUES (?, ?, ?)`;
        const inserts = players.map(({ user_id }) => new Promise((res, rej) => {
          const score = winners.includes(user_id) ? points : 0;
          db.run(insertSql, [user_id, gameId, score], (insertErr) => insertErr ? rej(insertErr) : res());
        }));

        Promise.all(inserts)
          .then(() => {
            logger.info(`Wie ben ik: scoring updated for game ${gameId} (winners get ${points} points).`);
            resolve(true);
          })
          .catch(reject);
      });
    });
  });
}

async function getGameScore(gameId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT u.username, COALESCE(s.score, 0) AS score
       FROM wbi_players p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN wbi_scores s ON s.user_id = p.user_id AND s.game_id = p.game_id
       WHERE p.game_id = ?
       ORDER BY score DESC`,
      [gameId],
      (err, rows) => {
        if (err) {
          logger.error('Wie ben ik: error fetching last game scores:', err.message);
          return reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function getMonthlyScores(month) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT u.username, SUM(s.score) AS total_score
       FROM wbi_scores s
       JOIN users u ON s.user_id = u.id
       WHERE strftime('%Y-%m', s.created_at) = ?
       GROUP BY u.id
       ORDER BY total_score DESC`,
      [month],
      (err, rows) => {
        if (err) {
          logger.error('Wie ben ik: error fetching monthly scores:', err.message);
          return reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function getPreviousMonthWinner() {
  const previousMonth = new Date();
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const monthStr = previousMonth.toISOString().slice(0, 7);

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT u.username, SUM(s.score) AS score
       FROM wbi_scores s
       JOIN users u ON s.user_id = u.id
       WHERE strftime('%Y-%m', s.created_at) = ?
       GROUP BY u.id
       ORDER BY score DESC
       LIMIT 1`,
      [monthStr],
      (err, row) => {
        if (err) {
          logger.error('Wie ben ik: error fetching previous month winner:', err.message);
          return reject(err);
        }
        resolve(row ? { username: row.username, score: row.score } : null);
      }
    );
  });
}

module.exports = {
  updateScoring,
  getGameScore,
  getMonthlyScores,
  getPreviousMonthWinner,
  getWinnerPoints
};
