const bcrypt = require('bcrypt');
const { db } = require('../models/user'); 
const logger = require('../logger');  

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  logger.info('Usage: node addUser.js <username> <password>');
  process.exit(1);
}

const passwordHash = bcrypt.hashSync(password, 10);

db.run(
  'INSERT INTO users (username, passwordHash) VALUES (?, ?)',
  [username, passwordHash],
  function (err) {
    if (err) {
      return logger.info('Error adding user:', err.message);
    }
    logger.info(`User ${username} added with ID ${this.lastID}`);
  }
);
