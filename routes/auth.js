// routes/auth.js

const express = require('express');
const router = express.Router();
const moment = require('moment');
const isVacation = moment().isBefore('2025-08-01');
const bcrypt = require('bcrypt');
const path = require('path');
const { db } = require('../models/user');
const logger = require('../logger');  


const { requireLogin } = require('../middleware/authMiddleware');

// Brute-force protection: after MAX_FAILED_LOGINS wrong passwords from the same
// IP address, that address is locked out for LOCKOUT_MS. Kept in memory, so a
// restart clears all lockouts.
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 60 * 60 * 1000; // 1 hour
const failedLogins = new Map(); // ip -> { count, lockedUntil }

function isLockedOut(ip) {
    const entry = failedLogins.get(ip);
    if (!entry || !entry.lockedUntil) return false;
    if (Date.now() < entry.lockedUntil) return true;
    failedLogins.delete(ip); // lockout expired, start counting again
    return false;
}

function registerFailedLogin(ip) {
    const entry = failedLogins.get(ip) || { count: 0, lockedUntil: null };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_LOGINS) {
        entry.lockedUntil = Date.now() + LOCKOUT_MS;
        logger.info(`IP ${ip} locked out for 1 hour after ${entry.count} failed login attempts.`);
    }
    failedLogins.set(ip, entry);
}

router.get('/login', (req, res) => {
    logger.info('GET /login');
    res.sendFile('login.html', { root: path.join(__dirname, '../public') });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    logger.info(`POST /login attempt for user: ${username}`);

    if (isLockedOut(req.ip)) {
        logger.info(`Blocked login attempt for user: ${username} from locked-out IP ${req.ip}`);
        return res.redirect('/login?error=locked');
    }

    db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username], (err, user) => {
      if (err) {
        logger.error(err.message);
        res.redirect('/login?error=1');
      } else if (user && bcrypt.compareSync(password, user.passwordHash)) {
        logger.info(`User ${username} logged in successfully.`);
        failedLogins.delete(req.ip);
        req.session.userId = user.id;
        res.redirect('/dashboard');
      } else {
        logger.info(`Failed login attempt for user: ${username} from IP ${req.ip}`);
        registerFailedLogin(req.ip);
        res.redirect(isLockedOut(req.ip) ? '/login?error=locked' : '/login?error=1');
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
    if (isVacation) {
        logger.info('Vacation mode: showing vacation page to authenticated user.');
        return res.sendFile('vacation.html', { root: path.join(__dirname, '../public') });
    }
    res.sendFile('dashboard.html', { root: path.join(__dirname, '../public') });
});

module.exports = router;
