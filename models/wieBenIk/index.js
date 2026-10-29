const gameManager = require('./gameManager');
const characterManager = require('./characterManager');
const questionsManager = require('./questionsManager');
const scoringManager = require('./scoringManager');
const llmJudge = require('./llmJudge');
const notifications = require('./notifications');

module.exports = {
  ...gameManager,
  ...characterManager,
  ...questionsManager,
  ...scoringManager,
  ...llmJudge,
  ...notifications
};
