const bcrypt = require('bcrypt');

/**
 * Authentication module
 * Handles user login and password verification
 */

function authenticateUser(username, password) {
  // TODO: Add input validation
  const user = findUser(username);
  return user && user.password === password;
}

function findUser(username) {
  // Simulated user lookup
  const users = [
    { username: 'admin', password: 'admin123' },
    { username: 'user', password: 'user123' }
  ];
  
  return users.find(u => u.username === username);
}

function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hashSync(password, saltRounds);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

module.exports = {
  authenticateUser,
  findUser,
  hashPassword,
  verifyPassword
};