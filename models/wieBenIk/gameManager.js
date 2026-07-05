//models/wieBenIk/gameManager.js
const logger = require('../../logger');
const db = require('../db');
require('./schema'); // ensure wbi_* tables exist
const characterManager = require('./characterManager');

// Returns the current global active game (if any).
// Mirrors the Pictionary behaviour: if there is no ongoing game but the last
// game finished less than 24 hours ago, a 'scoring' pseudo-state is returned
// so the scoreboard is shown before a new game starts.
async function getActiveGame() {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM wbi_games
      WHERE status = 'ongoing'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    db.get(sql, [], (err, row) => {
      if (err) {
        logger.error('Wie ben ik: failed to fetch active game:', err.message);
        return reject(err);
      }
      if (row) return resolve(row);

      const lastCompletedSql = `
        SELECT game_id, completed_at FROM wbi_games
        WHERE status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 1
      `;
      db.get(lastCompletedSql, [], (err2, lastGame) => {
        if (err2) {
          logger.error('Wie ben ik: failed to fetch last completed game:', err2.message);
          return reject(err2);
        }
        if (lastGame?.completed_at) {
          const completedAt = new Date(lastGame.completed_at);
          const diffHours = (new Date() - completedAt) / (1000 * 60 * 60);
          if (diffHours < 24) {
            logger.info(`Wie ben ik: last game ${lastGame.game_id} ended ${diffHours.toFixed(2)}h ago, returning 'scoring' state.`);
            return resolve({
              game_id: lastGame.game_id,
              state: 'scoring',
              status: 'completed'
            });
          }
        }
        resolve(null);
      });
    });
  });
}

// Creates a new game with all users that enabled the game; starts in theme vote.
async function createNewGame(activeUserIds) {
  return new Promise((resolve, reject) => {
    const insertSql = `
      INSERT INTO wbi_games (state, status, current_round)
      VALUES ('theme_vote', 'ongoing', 0)
    `;
    db.run(insertSql, [], function (insertErr) {
      if (insertErr) {
        logger.error('Wie ben ik: failed to create a new game:', insertErr.message);
        return reject(insertErr);
      }
      const gameId = this.lastID;
      const playerSql = `INSERT INTO wbi_players (game_id, user_id) VALUES (?, ?)`;
      const inserts = activeUserIds.map(userId => new Promise((res, rej) => {
        db.run(playerSql, [gameId, userId], (err) => err ? rej(err) : res());
      }));
      Promise.all(inserts)
        .then(() => {
          logger.info(`Wie ben ik: new game ${gameId} created with players: ${JSON.stringify(activeUserIds)}`);
          resolve(gameId);
        })
        .catch(reject);
    });
  });
}

async function getGameById(gameId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM wbi_games WHERE game_id = ?`, [gameId], (err, row) => {
      if (err) {
        logger.error(`Wie ben ik: failed to fetch game ${gameId}:`, err.message);
        return reject(err);
      }
      resolve(row);
    });
  });
}

// All players of a game with their (possible) character and username.
async function getPlayers(gameId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT p.user_id, u.username, p.character_name, p.character_description, p.theme_vote
      FROM wbi_players p
      JOIN users u ON p.user_id = u.id
      WHERE p.game_id = ?
      ORDER BY p.user_id ASC
    `;
    db.all(sql, [gameId], (err, rows) => {
      if (err) {
        logger.error(`Wie ben ik: failed to fetch players for game ${gameId}:`, err.message);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

async function setGameState(gameId, state) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE wbi_games SET state = ? WHERE game_id = ?`, [state, gameId], (err) => {
      if (err) {
        logger.error('Wie ben ik: failed to update game state:', err.message);
        return reject(err);
      }
      resolve();
    });
  });
}

async function submitThemeVote(gameId, userId, themeId) {
  return new Promise((resolve, reject) => {
    const sql = `UPDATE wbi_players SET theme_vote = ? WHERE game_id = ? AND user_id = ?`;
    db.run(sql, [themeId, gameId, userId], function (err) {
      if (err) {
        logger.error('Wie ben ik: failed to submit theme vote:', err.message);
        return reject(err);
      }
      logger.info(`Wie ben ik: user ${userId} voted theme '${themeId}' in game ${gameId}`);
      resolve(this.changes > 0);
    });
  });
}

// When every player voted: pick the theme with the most votes (random among
// ties), assign a distinct character to every player and start round 1.
async function checkForEndOfThemeVote(gameId) {
  const players = await getPlayers(gameId);
  if (players.length === 0) return false;
  if (players.some(p => !p.theme_vote)) return false;

  // Re-check state so a concurrent resolution doesn't assign twice.
  const game = await getGameById(gameId);
  if (!game || game.state !== 'theme_vote') return false;

  const tally = {};
  players.forEach(p => { tally[p.theme_vote] = (tally[p.theme_vote] || 0) + 1; });
  const maxVotes = Math.max(...Object.values(tally));
  const topThemes = Object.keys(tally).filter(t => tally[t] === maxVotes);
  const themeId = topThemes[Math.floor(Math.random() * topThemes.length)];
  const themeName = characterManager.getThemeName(themeId);

  const figures = characterManager.pickRandomFigures(themeId, players.length);

  logger.info(`Wie ben ik: game ${gameId} theme resolved to '${themeId}' (${maxVotes} votes, tie between ${topThemes.length}).`);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const updatePlayer = `
        UPDATE wbi_players SET character_name = ?, character_description = ?
        WHERE game_id = ? AND user_id = ?
      `;
      players.forEach((p, i) => {
        db.run(updatePlayer, [figures[i].naam, figures[i].omschrijving || '', gameId, p.user_id], (err) => {
          if (err) logger.error(`Wie ben ik: failed to assign character to user ${p.user_id}:`, err.message);
        });
      });
      db.run(
        `UPDATE wbi_games SET theme_id = ?, theme_name = ?, state = 'question', current_round = 1 WHERE game_id = ?`,
        [themeId, themeName, gameId],
        (err) => {
          if (err) {
            logger.error(`Wie ben ik: failed to start game ${gameId} after theme vote:`, err.message);
            return reject(err);
          }
          logger.info(`Wie ben ik: game ${gameId} started with theme '${themeName}', round 1.`);
          resolve(true);
        }
      );
    });
  });
}

async function completeGame(gameId, winnerUserIds) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE wbi_games
      SET state = 'completed', status = 'completed', winners = ?, completed_at = datetime('now')
      WHERE game_id = ? AND status = 'ongoing'
    `;
    db.run(sql, [JSON.stringify(winnerUserIds), gameId], function (err) {
      if (err) {
        logger.error(`Wie ben ik: failed to complete game ${gameId}:`, err.message);
        return reject(err);
      }
      logger.info(`Wie ben ik: game ${gameId} completed, winners: ${JSON.stringify(winnerUserIds)}`);
      resolve(this.changes > 0);
    });
  });
}

async function getLatestGameId() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT game_id FROM wbi_games WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
      (err, row) => {
        if (err) {
          logger.error('Wie ben ik: error fetching latest game ID:', err.message);
          return reject(err);
        }
        resolve(row ? row.game_id : null);
      }
    );
  });
}

async function getPreviousGameId(gameId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT game_id FROM wbi_games WHERE status = 'completed' AND game_id < ? ORDER BY game_id DESC LIMIT 1`,
      [gameId],
      (err, row) => err ? reject(err) : resolve(row ? row.game_id : null)
    );
  });
}

async function getNextGameId(gameId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT game_id FROM wbi_games WHERE status = 'completed' AND game_id > ? ORDER BY game_id ASC LIMIT 1`,
      [gameId],
      (err, row) => err ? reject(err) : resolve(row ? row.game_id : null)
    );
  });
}

module.exports = {
  getActiveGame,
  createNewGame,
  getGameById,
  getPlayers,
  setGameState,
  submitThemeVote,
  checkForEndOfThemeVote,
  completeGame,
  getLatestGameId,
  getPreviousGameId,
  getNextGameId
};
