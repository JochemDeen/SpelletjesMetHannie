// models/users.js
const sqlite3 = require('sqlite3').verbose();
const db = require('./db'); // Use shared database connection


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
async function getAllUserIds() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id FROM users`;
    db.all(sql, [], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows.map(row => row.id));
    });
  });
}

async function getActivePictionaryUserIds() {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT u.id FROM users u
      LEFT JOIN user_settings us ON u.id = us.user_id AND us.setting_key = 'pictionaryEnabled'
      WHERE COALESCE(us.setting_value, '1') = '1'
    `;
    db.all(sql, [], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows.map(row => row.id));
    });
  });
}


module.exports = {
  db,
  getUsernameById,
  getAllUserIds,
  getActivePictionaryUserIds
};