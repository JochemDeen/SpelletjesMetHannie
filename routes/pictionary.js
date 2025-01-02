// routes/pictionary.js
const express = require('express');
const router = express.Router();
const path = require('path');
const { requireLogin } = require('../middleware/authMiddleware');
const logger = require('../logger');
const wordsService = require('../models/wordsService');

//const Pictionary = require('../models/Pictionary'); // Import the game logic

// Pictionary Game Page
router.get('/pictionary', requireLogin, (req, res) => {
    logger.info(`GET /pictionary for user: ${req.session.userId}`);
    res.sendFile('pictionary.html', { root: path.join(__dirname, '../public/pictionary') });
  });
  


module.exports = router;