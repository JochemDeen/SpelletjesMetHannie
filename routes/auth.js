const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('../models/user');

const { requireLogin } = require('../middleware/authMiddleware');

router.get('/login', (req, res) => {
    res.sendFile('login.html', { root: path.join(__dirname, '../public') });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
  
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
      if (err) {
        console.error(err.message);
        res.redirect('/login?error=1');
      } else if (user && bcrypt.compareSync(password, user.passwordHash)) {
        req.session.userId = user.id;
        res.redirect('/dashboard');
      } else {
        res.redirect('/login?error=1');
      }
    });
  });
  

router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.send('Er is een fout opgetreden.');
        }
        res.redirect('/login');
    });
});


// Dashboard Route
router.get('/dashboard', requireLogin, (req, res) => {
    res.sendFile('dashboard.html', { root: path.join(__dirname, '../public') });
});

module.exports = router;
