// Load environment variables
require('dotenv').config();

const express = require('express');
const session = require('express-session'); // Import express-session
const SQLiteStore = require('connect-sqlite3')(session);

const path = require('path');
const authRoutes = require('./routes/auth');
const mastermindRoutes = require('./routes/mastermind_routes');
const pictionaryRoutes = require('./routes/pictionary_routes');
const wieBenIkRoutes = require('./routes/wie_ben_ik_routes');
const settingsRoutes = require('./routes/settings');
const rateRoutes = require('./routes/ratings');
const { requireLogin } = require('./middleware/authMiddleware');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // Behind the Lightsail/Bitnami proxy

// Express 4 does not catch errors thrown inside async route handlers. Without
// this handler Node exits on such an error and the whole site goes down; now
// the error is logged instead.
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled promise rejection: ${reason && reason.stack ? reason.stack : reason}`);
});

// Basic security headers: don't advertise Express, don't let browsers guess
// content types (drawings are uploaded by players), and don't let other sites
// show this site in a frame (clickjacking).
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
  });
  next();
});

// Middleware to parse incoming JSON and form data
app.use(express.json({ limit: '2mb' })); // room for one 800x400 PNG drawing
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Serve static files from the 'public' directory. Assets (css/js/images) are
// served right away; .html pages only after the login check further down.
// redirect: false, so /pictionary reaches its route instead of being redirected
// to the public/pictionary/ folder.
const serveStatic = express.static(path.join(__dirname, 'public'), { redirect: false });
app.use((req, res, next) => (req.path.endsWith('.html') ? next() : serveStatic(req, res, next)));

if (!process.env.SESSION_SECRET) {
  logger.warn('SESSION_SECRET is not set in .env: sessions are signed with the default secret from the (public) source code.');
}

// Add session management
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Refresh the cookie expiry on every request, so active users stay logged in
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax', // Not sent along on POSTs coming from other sites (CSRF protection)
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

// Use mastermind routes
app.use('/', mastermindRoutes);

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

// Errors that reach Express (e.g. a malformed JSON body) are logged here,
// instead of sending a stack trace with server paths to the browser.
app.use((err, req, res, next) => {
  logger.error(`Error in ${req.method} ${req.path}: ${err.stack || err.message}`);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).send('Er is iets misgegaan.');
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
