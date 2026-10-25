import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

const db = inject('db');

// Each test file gets its own empty database, so the schema synced by
// TypeORM and the seeded roles/permissions never leak between files.
const database = `e2e_${randomUUID().replaceAll('-', '')}`;
const client = new pg.Client({
  host: db.host,
  port: db.port,
  user: db.username,
  password: db.password,
  database: db.database,
});
await client.connect();
await client.query(`CREATE DATABASE "${database}"`);
await client.end();

// Set before AppModule is imported; dotenv never overrides existing vars, so a
// developer's .env can't point the suite at a real database or bucket.
Object.assign(process.env, {
  DATABASE_HOST: db.host,
  DATABASE_PORT: String(db.port),
  DATABASE_USERNAME: db.username,
  DATABASE_PASSWORD: db.password,
  DATABASE_NAME: database,
  DATABASE_SYNC: 'true',
  DATABASE_SSL: 'false',
  JWT_SECRET: 'test-access-secret-at-least-32-characters',
  JWT_SECRET_REFRESH: 'test-refresh-secret-at-least-32-characters',
  JWT_EXPIRES_IN: '5m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost/api/auth/google/callback',
  GOOGLE_LOGIN_REDIRECT_URL_WEB: 'http://localhost/web/callback',
  GOOGLE_LOGIN_REDIRECT_URL_BO: 'http://localhost/bo/callback',
  STORAGE_ENDPOINT: 'http://localhost:9000',
  STORAGE_BUCKET: 'test-bucket',
  STORAGE_ACCESS_KEY_ID: 'test-access-key',
  STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
  STORAGE_PUBLIC_URL: 'http://localhost:9000/test-bucket',
  TRUST_PROXY: '',
});
