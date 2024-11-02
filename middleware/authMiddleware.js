function requireLogin(req, res, next) {
    if (req.session.userId) {
      next();
    } else {
      res.redirect('/login');
    }
  }
module.exports = { requireLogin };
