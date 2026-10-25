//models/mastermind/index.js
// Mastermind (shown to players as "Woordle"): the daily word game.
require('./schema');
const wordManager = require('./wordManager');
const resultsManager = require('./resultsManager');
const hintsManager = require('./hintsManager');

module.exports = {
  ...wordManager,
  ...resultsManager,
  ...hintsManager
};
