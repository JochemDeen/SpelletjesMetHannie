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
    
    // Insert default setting for pictionary (default = "1" for on)
    db.run(
      "INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES (?, 'pictionaryEnabled', '1')",
      [this.lastID],
      function(err) {
        if (err) {
          logger.error('Error setting default pictionary setting:', err.message);
        } else {
          logger.info('Default pictionary setting set to on.');
        }
      }
    );
  }
);