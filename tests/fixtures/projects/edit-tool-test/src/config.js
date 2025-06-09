/**
 * Application configuration
 */

const config = {
  server: {
    port: 3000,
    host: 'localhost',
    env: 'development',
  },

  database: {
    host: 'localhost',
    port: 5432,
    name: 'myapp_dev',
    user: 'postgres',
    password: 'password',
  },

  auth: {
    secretKey: 'your-secret-key',
    tokenExpiry: '24h',
    saltRounds: 10,
  },

  logging: {
    level: 'debug',
    file: 'app.log',
    console: true,
  },

  features: {
    userRegistration: true,
    emailVerification: false,
    socialLogin: false,
  },
};

function getConfig() {
  return config;
}

function updateConfig(section, key, value) {
  if (config[section]) {
    config[section][key] = value;
  }
}

module.exports = {
  config,
  getConfig,
  updateConfig,
};
