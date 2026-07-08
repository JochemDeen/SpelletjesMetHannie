//models/wieBenIk/scoringManager.js
const logger = require('../../logger');
const db = require('../db');

// Persists a completed game's outcome: winners get a win entry (score = 1),
// everyone else in the game gets a 0 entry so participation is recorded.
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

      db.all(`SELECT user_id FROM wbi_players WHERE game_id = ?`, [gameId], (err2, players) => {
        if (err2) {
          logger.error('Wie ben ik: error fetching players for scoring:', err2.message);
          return reject(err2);
        }

        const insertSql = `INSERT INTO wbi_scores (user_id, game_id, score) VALUES (?, ?, ?)`;
        const inserts = players.map(({ user_id }) => new Promise((res, rej) => {
          const won = winners.includes(user_id) ? 1 : 0;
          db.run(insertSql, [user_id, gameId, won], (insertErr) => insertErr ? rej(insertErr) : res());
        }));

        Promise.all(inserts)
          .then(() => {
            logger.info(`Wie ben ik: scoring updated for game ${gameId} (${winners.length} winner(s)).`);
            resolve(true);
          })
          .catch(reject);
      });
    });
  });
}

async function getMonthlyWinCounts(month) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT u.username, SUM(CASE WHEN s.score > 0 THEN 1 ELSE 0 END) AS wins
       FROM wbi_scores s
       JOIN users u ON s.user_id = u.id
       WHERE strftime('%Y-%m', s.created_at) = ?
       GROUP BY u.id
       ORDER BY wins DESC`,
      [month],
      (err, rows) => {
        if (err) {
          logger.error('Wie ben ik: error fetching monthly win counts:', err.message);
          return reject(err);
        }
        resolve(rows);
      }
    );
  });
}

async function getTotalWinCounts() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT u.username, SUM(CASE WHEN s.score > 0 THEN 1 ELSE 0 END) AS wins
       FROM wbi_scores s
       JOIN users u ON s.user_id = u.id
       GROUP BY u.id
       ORDER BY wins DESC`,
      [],
      (err, rows) => {
        if (err) {
          logger.error('Wie ben ik: error fetching total win counts:', err.message);
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
      `SELECT u.username, SUM(CASE WHEN s.score > 0 THEN 1 ELSE 0 END) AS wins
       FROM wbi_scores s
       JOIN users u ON s.user_id = u.id
       WHERE strftime('%Y-%m', s.created_at) = ?
       GROUP BY u.id
       ORDER BY wins DESC
       LIMIT 1`,
      [monthStr],
      (err, row) => {
        if (err) {
          logger.error('Wie ben ik: error fetching previous month winner:', err.message);
          return reject(err);
        }
        resolve(row && row.wins > 0 ? { username: row.username, wins: row.wins } : null);
      }
    );
  });
}

module.exports = {
  updateScoring,
  getMonthlyWinCounts,
  getTotalWinCounts,
  getPreviousMonthWinner
};
