// Single source of truth for environment configuration — every other module
// reads settings from here instead of touching process.env directly.
import 'dotenv/config';

export interface Config {
  port: number | string;
  mongodbUri: string;
  mongodbCollection: string;
}

const config: Config = {
  port: process.env.PORT || 4000,
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbCollection: process.env.MONGODB_COLLECTION || 'sessions',
};

if (!config.mongodbUri) {
  throw new Error('MONGODB_URI environment variable is not set. Copy .env.example to .env and fill it in.');
}

export default config;
