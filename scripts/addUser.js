const bcrypt = require('bcrypt');
const { db } = require('../models/user'); 

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  console.log('Usage: node addUser.js <username> <password>');
  process.exit(1);
}

const passwordHash = bcrypt.hashSync(password, 10);

db.run(
  'INSERT INTO users (username, passwordHash) VALUES (?, ?)',
  [username, passwordHash],
  function (err) {
    if (err) {
      return console.log('Error adding user:', err.message);
    }
    console.log(`User ${username} added with ID ${this.lastID}`);
  }
);
