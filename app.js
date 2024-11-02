require('dotenv').config();
const express = require('express');
const session = require('express-session'); // Import express-session
const bcrypt = require('bcrypt');
const db = require('./models/user');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add session management
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret', // Use a strong secret key in production!
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Note: `secure: true` requires HTTPS
}));


function requireLogin(req, res, next) {
    if (req.session.userId) {
      next();
    } else {
      res.redirect('/login');
    }
  }
    
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error(err.message);
            res.send('An error occurred.');
        } else if (user && bcrypt.compareSync(password, user.passwordHash)) {
            req.session.userId = user.id;
            res.redirect('/dashboard');
        } else {
            res.send('Invalid username or password.');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.send('Er is een fout opgetreden.');
        }
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.get('/dashboard', requireLogin, (req, res) => {
    res.send('Welkom!');
});

app.get('*', requireLogin, (req, res) => {
    res.redirect('/dashboard');
});
