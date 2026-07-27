// Single source of truth for environment configuration — every other module
// reads settings from here instead of touching process.env directly.
import 'dotenv/config';

export interface Config {
  port: number | string;
  mongodbUri: string;
  mongodbCollection: string;
  // GitHub OAuth App Client ID used for the device-flow sign-in (private-repo
  // clone). Empty unless the operator registers an OAuth app and sets it — the
  // sign-in endpoints return a clear error in that case rather than failing
  // opaquely. Public-repo cloning needs none of this.
  githubOAuthClientId: string;
}

const config: Config = {
  port: process.env.PORT || 4000,
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbCollection: process.env.MONGODB_COLLECTION || 'sessions',
  githubOAuthClientId: process.env.GITHUB_OAUTH_CLIENT_ID || '',
};

if (!config.mongodbUri) {
  throw new Error('MONGODB_URI environment variable is not set. Copy .env.example to .env and fill it in.');
}

export default config;
