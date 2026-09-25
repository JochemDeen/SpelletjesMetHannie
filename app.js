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
const { requireLogin } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON and form data
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Serve static files from the 'public' directory. Assets (css/js/images) are
// served right away; .html pages only after the login check further down.
const serveStatic = express.static(path.join(__dirname, 'public'));
app.use((req, res, next) => (req.path.endsWith('.html') ? next() : serveStatic(req, res, next)));

app.set('trust proxy', 1); // Trust first proxy

// Add session management
app.use(session({
    store: new SQLiteStore({ db: 'sessions.sqlite' }),
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh the cookie expiry on every request, so active users stay logged in
    cookie: {
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 90 * 24 * 60 * 60 * 1000 // Expire after 90 days of inactivity
    }
  }));

  // Static .html pages are only served to logged-in users
  app.use((req, res, next) => {
    if (!req.path.endsWith('.html')) return next();
    requireLogin(req, res, () => serveStatic(req, res, next));
  });

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
  