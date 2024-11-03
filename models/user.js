const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

// Create the users table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      passwordHash TEXT
    )
  `);
});

// Function to get username by user_id
async function getUsernameById(user_id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT username FROM users WHERE id = ?', [user_id], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row ? row.username : null);
    });
  });
}

module.exports = {
  db,
  getUsernameById,
};
