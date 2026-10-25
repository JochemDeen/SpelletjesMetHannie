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
    // Default for wieBenIkEnabled follows the pictionary setting if not set,
    // so the toggle in the UI matches who actually joins a new game.
    if (!settings.wieBenIkEnabled) {
      settings.wieBenIkEnabled = settings.pictionaryEnabled;
    }
    logger.info(`Settings for user ${userId}:`, settings);
    res.json(settings);
  });
});

// Toggle settings: each URL stores one on/off key with value "1" or "0".
const TOGGLES = {
  '/api/pictionary': 'pictionaryEnabled',
  '/api/wie-ben-ik': 'wieBenIkEnabled'
};

for (const [url, key] of Object.entries(TOGGLES)) {
  router.post(url, requireLogin, (req, res) => {
    const userId = req.session.userId;
    const value = String(req.body[key]);
    logger.info(`POST /settings${url} userId: ${userId}, ${key}: ${value}`);
    if (value !== '0' && value !== '1') {
      return res.status(400).json({ error: 'Ongeldige waarde' });
    }
    const sql = `
      INSERT OR REPLACE INTO user_settings (user_id, setting_key, setting_value)
      VALUES (?, ?, ?)
    `;
    db.run(sql, [userId, key, value], (err) => {
      if (err) {
        logger.error('Error updating setting:', err.message);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      res.json({ success: true, [key]: value });
    });
  });
}

module.exports = router;