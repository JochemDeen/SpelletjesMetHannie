// routes/auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { db, getUsernameById } = require('../models/user');
const logger = require('../logger');
const { siteInfo } = require('../models/siteInfo');


const { requireLogin } = require('../middleware/authMiddleware');
const { servePage } = require('../utils/servePage');

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

router.get('/login', servePage('login.html'));

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    logger.info(`POST /login attempt for user: ${username}`);

    if (isLockedOut(req.ip)) {
        logger.info(`Blocked login attempt for user: ${username} from locked-out IP ${req.ip}`);
        return res.redirect('/login?error=locked');
    }

    // bcrypt throws on a missing or non-text password, and inside the database
    // callback below that would crash the whole server.
    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.redirect('/login?error=1');
    }

    db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [username], (err, user) => {
      if (err) {
        logger.error(err.message);
        res.redirect('/login?error=1');
      } else if (user && bcrypt.compareSync(password, user.passwordHash)) {
        logger.info(`User ${username} logged in successfully.`);
        failedLogins.delete(req.ip);
        // Start a fresh session on login, so a session id that existed before
        // logging in can't be reused to ride along (session fixation).
        req.session.regenerate((regenerateErr) => {
          if (regenerateErr) {
            logger.error(regenerateErr.message);
            return res.redirect('/login?error=1');
          }
          req.session.userId = user.id;
          res.redirect('/dashboard');
        });
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


router.get('/dashboard', requireLogin, servePage('dashboard.html'));

// Basic site info for the dashboard footer
router.get('/api/site-info', requireLogin, (req, res) => {
    res.json(siteInfo);
});

// Who is logged in (for the greeting on the dashboard)
router.get('/api/me', requireLogin, async (req, res) => {
    try {
        const username = await getUsernameById(req.session.userId);
        res.json({ username });
    } catch (error) {
        logger.error('Error fetching current user:', error);
        res.status(500).json({ error: 'Er is iets misgegaan.' });
    }
});

module.exports = router;
