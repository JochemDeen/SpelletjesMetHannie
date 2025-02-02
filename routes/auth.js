// routes/auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const path = require('path');
const { db } = require('../models/user');
const logger = require('../logger');  

const { requireLogin } = require('../middleware/authMiddleware');

router.get('/login', (req, res) => {
    logger.info('GET /login');
    res.sendFile('login.html', { root: path.join(__dirname, '../public') });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    logger.info(`POST /login attempt for user: ${username}`);

    db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username], (err, user) => {
      if (err) {
        logger.error(err.message);
        res.redirect('/login?error=1');
      } else if (user && bcrypt.compareSync(password, user.passwordHash)) {
        logger.info(`User ${username} logged in successfully.`);
        req.session.userId = user.id;
        res.redirect('/dashboard');
      } else {
        logger.info(`Failed login attempt for user: ${username}`);
        res.redirect('/login?error=1');
      }
    });
  });
  

router.get('/logout', (req, res) => {
    logger.info('GET /logout');
    req.session.destroy(err => {
        if (err) {
            return res.send('Er is een fout opgetreden.');
        }
        logger.info('User logged out successfully.');
        res.redirect('/login');
    });
});


// Dashboard Route
router.get('/dashboard', requireLogin, (req, res) => {
    res.sendFile('dashboard.html', { root: path.join(__dirname, '../public') });
});

module.exports = router;
