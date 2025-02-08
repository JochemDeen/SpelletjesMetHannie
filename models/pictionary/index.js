const gameManager = require('./gameManager');
const wordManager = require('./wordManager');
const drawingManager = require('./drawingManager');
const guessesManager = require('./guessesManager');
const scoringManager = require('./scoringManager');

module.exports = {
  ...gameManager,
  ...wordManager,
  ...drawingManager,
  ...guessesManager,
  ...scoringManager
};