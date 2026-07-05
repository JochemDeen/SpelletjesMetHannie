// Load environment variables
require('dotenv').config();

const express = require('express');
const session = require('express-session'); // Import express-session
const SQLiteStore = require('connect-sqlite3')(session);

const path = require('path');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');
const pictionaryRoutes = require('./routes/pictionary_routes');
const wieBenIkRoutes = require('./routes/wie_ben_ik_routes');
const settingsRoutes = require('./routes/settings');
const rateRoutes = require('./routes/ratings');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON and form data
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.set('trust proxy', 1); // Trust first proxy

// Add session management
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite' }),
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 7 * 24 * 60 * 60 * 1000 // Optional: Set cookie to expire in 7 days
    }
  }));
  
  // Use authentication routes
  app.use('/', authRoutes);

  // Use game routes
  app.use('/', gameRoutes);

  // Use pictionary routes
  app.use('/', pictionaryRoutes);

  // Use wie ben ik routes
  app.use('/', wieBenIkRoutes);

  // Use rating routes
  app.use('/', rateRoutes);

  // Use settings routes
  app.use('/settings', settingsRoutes);

  // Catch-all route to handle all other requests
  app.get('*', (req, res) => {
    if (req.session.userId) {
      res.redirect('/dashboard');
    } else {
      res.redirect('/login');
    }
  });
  
  // Start the server
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  