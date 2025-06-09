const express = require('express');
const { authenticateUser } = require('./auth');
const { createUser, getUserById } = require('./user');
const { getConfig } = require('./config');

const app = express();
const config = getConfig();

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication endpoint
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (authenticateUser(username, password)) {
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// User management endpoints
app.post('/users', (req, res) => {
  try {
    const user = createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/users/:id', (req, res) => {
  const user = getUserById(req.params.id);
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// Start server
const port = config.server.port;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
