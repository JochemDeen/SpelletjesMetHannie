// utils/servePage.js
// Route handler that sends one of the static pages from public/.
const path = require('path');
const logger = require('../logger');

const PUBLIC_DIR = path.join(__dirname, '../public');

// file is relative to public/, e.g. 'mastermind.html' or 'pictionary/pictionary.html'
function servePage(file) {
  return (req, res) => {
    logger.info(`GET ${req.path} for user: ${req.session.userId}`);
    res.sendFile(file, { root: PUBLIC_DIR });
  };
}

module.exports = { servePage };
