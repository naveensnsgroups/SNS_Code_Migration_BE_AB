// Single source of truth for environment configuration — every other module
// reads settings from here instead of touching process.env directly.
require('dotenv').config();

const config = {
  port: process.env.PORT || 4000,
  mongodbUri: process.env.MONGODB_URI,
  mongodbCollection: process.env.MONGODB_COLLECTION || 'sessions',
};

if (!config.mongodbUri) {
  throw new Error('MONGODB_URI environment variable is not set. Copy .env.example to .env and fill it in.');
}

module.exports = config;
