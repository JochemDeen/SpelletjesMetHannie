//models/pictionary/drawingManager.js
// Drawing deadlines and saving the drawer's PNGs to public/images/drawings.
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');
const db = require('../db');

const DRAWINGS_DIR = path.join(__dirname, '../../public/images/drawings');
const DRAWING_WIDTH = 800;
const DRAWING_HEIGHT = 400;
const MAX_DRAWING_BYTES = 1.5 * 1024 * 1024;
const MODIFY_SECONDS = 15;
// Extra time after a deadline before a submission is refused (slow phones,
// slow uploads); also how long the server waits before giving up on a drawer.
const GRACE_MS = 5 * 1000;
const ABANDON_AFTER_MS = 30 * 1000;

function run(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

// Seconds left until an ISO deadline (0 when passed or missing)
function secondsLeft(deadline) {
  if (!deadline) return 0;
  return Math.max(0, Math.round((new Date(deadline) - Date.now()) / 1000));
}

// Has the deadline passed by more than ms milliseconds?
function isPastDeadline(deadline, ms = GRACE_MS) {
  return !!deadline && Date.now() > new Date(deadline).getTime() + ms;
}

// Start the drawing phase: the game's drawing_completed_at holds the deadline.
// Returns { countdown, endsAt }.
async function startDrawing(game_id) {
  const row = await get('SELECT countdown_seconds FROM games WHERE game_id = ?', [game_id]);
  const seconds = row ? row.countdown_seconds : 60;
  const endsAt = new Date(Date.now() + seconds * 1000).toISOString();
  await run(`UPDATE games SET state = 'drawing', drawing_completed_at = ? WHERE game_id = ?`, [endsAt, game_id]);
  logger.info(`Drawing phase started for game ${game_id}, ends at ${endsAt}`);
  return { countdown: seconds, endsAt };
}

// Check a data URL from the canvas: a real PNG of the expected size, not too big.
// Returns the decoded bytes; throws a user-facing error otherwise.
function decodeDrawing(drawingData) {
  const prefix = 'data:image/png;base64,';
  if (typeof drawingData !== 'string' || !drawingData.startsWith(prefix)) {
    throw Object.assign(new Error('Dat is geen tekening.'), { status: 400 });
  }
  const bytes = Buffer.from(drawingData.slice(prefix.length), 'base64');
  const isPng = bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.toString('ascii', 12, 16) === 'IHDR';
  if (!isPng) {
    throw Object.assign(new Error('Dat is geen tekening.'), { status: 400 });
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== DRAWING_WIDTH || height !== DRAWING_HEIGHT) {
    throw Object.assign(new Error('De tekening heeft niet het goede formaat.'), { status: 400 });
  }
  if (bytes.length > MAX_DRAWING_BYTES) {
    throw Object.assign(new Error('De tekening is te groot.'), { status: 400 });
  }
  return bytes;
}

// Write a validated drawing to a new file; returns its public path.
async function saveDrawingToFile(drawingData, gameId) {
  const bytes = decodeDrawing(drawingData);
  await fs.promises.mkdir(DRAWINGS_DIR, { recursive: true });
  const filename = `game_${gameId}_${Date.now()}.png`;
  await fs.promises.writeFile(path.join(DRAWINGS_DIR, filename), bytes);
  logger.info(`Drawing saved as ${filename}`);
  return `/images/drawings/${filename}`;
}

// Save the first drawing of a game and move on to guessing.
async function saveDrawing(game_id, drawingData) {
  const game = await get('SELECT state, drawing_completed_at FROM games WHERE game_id = ?', [game_id]);
  if (!game) throw new Error('Game not found.');
  if (game.state !== 'drawing') {
    throw Object.assign(new Error('Er wordt nu niet getekend.'), { status: 400 });
  }
  if (isPastDeadline(game.drawing_completed_at)) {
    throw Object.assign(new Error('De tijd is om.'), { status: 400 });
  }
  const filePath = await saveDrawingToFile(drawingData, game_id);
  await run(`UPDATE games SET image_path = ?, state = 'guessing' WHERE game_id = ?`, [filePath, game_id]);
  return filePath;
}

// Enter the one touch-up per round. Records the touch-up right away, so it
// counts as used even if the drawer walks away. Calling it again during the
// touch-up (e.g. after a reload) returns the same deadline, also once it has
// passed (countdown 0), instead of restarting it.
// Returns { countdown, endsAt }.
async function startModification(game) {
  if (game.state === 'modify') {
    return { countdown: secondsLeft(game.drawing_completed_at), endsAt: game.drawing_completed_at };
  }
  const endsAt = new Date(Date.now() + MODIFY_SECONDS * 1000).toISOString();
  await run(`UPDATE games SET state = 'modify', drawing_completed_at = ? WHERE game_id = ?`, [endsAt, game.game_id]);
  await run(
    'INSERT INTO actions (game_id, user_id, action, round_number, content) VALUES (?, ?, ?, ?, ?)',
    [game.game_id, game.drawer_user_id, 'modify_drawing', game.current_round, 'Drawing modified']
  );
  logger.info(`Game ${game.game_id}: touch-up started, ends at ${endsAt}`);
  return { countdown: MODIFY_SECONDS, endsAt };
}

// Save the touched-up drawing as a new file (the old one stays as it was)
// and go back to grading.
async function saveModifiedDrawing(game, drawingData) {
  if (isPastDeadline(game.drawing_completed_at)) {
    await run(`UPDATE games SET state = 'feedback' WHERE game_id = ?`, [game.game_id]);
    throw Object.assign(new Error('De tijd is om.'), { status: 400 });
  }
  const filePath = await saveDrawingToFile(drawingData, game.game_id);
  await run(`UPDATE games SET image_path = ?, state = 'feedback' WHERE game_id = ?`, [filePath, game.game_id]);
  return filePath;
}

async function hasModifiedDrawing(gameId, roundNumber) {
  const row = await get(
    `SELECT COUNT(*) AS cnt FROM actions WHERE game_id = ? AND round_number = ? AND action = 'modify_drawing'`,
    [gameId, roundNumber]
  );
  return Number(row?.cnt) > 0;
}

module.exports = {
  ABANDON_AFTER_MS,
  secondsLeft,
  isPastDeadline,
  startDrawing,
  saveDrawing,
  startModification,
  saveModifiedDrawing,
  hasModifiedDrawing
};
