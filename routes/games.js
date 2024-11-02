// routes/games.js

const express = require('express');
const router = express.Router();
const path = require('path');
const { requireLogin } = require('../middleware/authMiddleware');

// Mastermind Game Page
router.get('/mastermind', requireLogin, (req, res) => {
  res.sendFile('mastermind.html', { root: path.join(__dirname, '../public') });
});

router.get('/mastermind/stats', requireLogin, (req, res) => {
    const user_id = req.session.userId;
  
    gameResults.getGameResultsByUser(user_id, (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('An error occurred while fetching game results.');
      }
      res.json(results);
    });
  });
  

module.exports = router;
