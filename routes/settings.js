// routes/settings.js
const express = require('express');
const path = require('path');
const router = express.Router();
const db = require('../models/db');
const logger = require('../logger');
const { requireLogin } = require('../middleware/authMiddleware');

// Serve the settings page
router.get('/', requireLogin, (req, res) => {
    logger.info('GET /settings');
    res.sendFile('settings.html', { root: path.join(__dirname, '../public') });
  });
  
// Get all settings for the logged-in user
router.get('/api', requireLogin, (req, res) => {
  const userId = req.session.userId;
  logger.info(`GET /settings/api userId: ${userId}`);
  const sql = `SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?`;
  db.all(sql, [userId], (err, rows) => {
    if (err) {
      logger.error('Error retrieving settings:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    // Default for pictionaryEnabled is "1" if not set
    if (!settings.pictionaryEnabled) {
      settings.pictionaryEnabled = "1";
    }
    logger.info(`Settings for user ${userId}:`, settings);
    res.json(settings);
  });
});

// Update pictionary setting
router.post('/api/pictionary', requireLogin, (req, res) => {
    const userId = req.session.userId;
    const { pictionaryEnabled } = req.body; // "1" or "0"
    logger.info(`POST /settings/api/pictionary userId: ${userId}, pictionaryEnabled: ${pictionaryEnabled}`);
    const sql = `
      INSERT OR REPLACE INTO user_settings (user_id, setting_key, setting_value)
      VALUES (?, 'pictionaryEnabled', ?)
    `;
    db.run(sql, [userId, pictionaryEnabled], function(err) {
      if (err) {
        logger.error('Error updating setting:', err.message);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      res.json({ success: true, pictionaryEnabled });
    });
  });


module.exports = router;