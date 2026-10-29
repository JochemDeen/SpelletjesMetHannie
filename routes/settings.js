// routes/settings.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');
const logger = require('../logger');
const { requireLogin } = require('../middleware/authMiddleware');
const { servePage } = require('../utils/servePage');
const push = require('../models/push');

// Serve the settings page
router.get('/', requireLogin, servePage('settings.html'));
  
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
    // Every kind of notification is on until the user turns it off
    Object.values(push.KINDS).forEach((key) => {
      if (!settings[key]) settings[key] = '1';
    });
    logger.info(`Settings for user ${userId}:`, settings);
    res.json(settings);
  });
});

// Toggle settings: each URL stores one on/off key with value "1" or "0".
const TOGGLES = {
  '/api/pictionary': 'pictionaryEnabled',
  '/api/wie-ben-ik': 'wieBenIkEnabled',
  '/api/notify/pictionary': push.KINDS.pictionary,
  '/api/notify/wie-ben-ik': push.KINDS.wieBenIk,
  '/api/notify/woordle': push.KINDS.woordle,
  '/api/notify/results': push.KINDS.results
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

// ----------------------
// Push notifications: one subscription per device
// ----------------------
router.get('/api/push', requireLogin, (req, res) => {
  res.json({ available: push.isConfigured(), publicKey: push.publicKey() });
});

router.post('/api/push/subscribe', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const subscription = push.parseSubscription(req.body.subscription);
  if (!subscription) {
    logger.warn(`POST /settings/api/push/subscribe userId: ${userId}: invalid subscription`);
    return res.status(400).json({ error: 'Meldingen aanzetten is niet gelukt.' });
  }
  try {
    await push.saveSubscription(userId, subscription);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error saving push subscription:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/api/push/unsubscribe', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  if (typeof req.body.endpoint !== 'string') {
    return res.status(400).json({ error: 'Ongeldig verzoek' });
  }
  try {
    await push.removeSubscription(userId, req.body.endpoint);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing push subscription:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/api/push/test', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  logger.info(`POST /settings/api/push/test userId: ${userId}`);
  try {
    const sent = await push.sendTest(userId);
    if (sent === 0) {
      return res.status(400).json({ error: 'Geen apparaat gevonden om een melding naar te sturen.' });
    }
    res.json({ success: true, sent });
  } catch (error) {
    logger.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;