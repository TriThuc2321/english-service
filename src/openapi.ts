import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';

import { createOpenApiDocument } from './configs/swagger.config.js';

// Env is validated when AppModule is imported, but no value reaches the
// document — preview mode never instantiates providers, so nothing connects.
Object.assign(process.env, {
  DATABASE_HOST: 'localhost',
  DATABASE_USERNAME: 'openapi',
  DATABASE_PASSWORD: 'openapi',
  DATABASE_NAME: 'openapi',
  JWT_SECRET: 'openapi-placeholder-secret-32-characters',
  JWT_SECRET_REFRESH: 'openapi-placeholder-secret-32-characters',
  GOOGLE_CLIENT_ID: 'openapi',
  GOOGLE_CLIENT_SECRET: 'openapi',
  GOOGLE_CALLBACK_URL: 'http://localhost/api/auth/google/callback',
  GOOGLE_LOGIN_REDIRECT_URL_WEB: 'http://localhost/web/callback',
  GOOGLE_LOGIN_REDIRECT_URL_BO: 'http://localhost/bo/callback',
  STORAGE_ENDPOINT: 'http://localhost:9000',
  STORAGE_BUCKET: 'openapi',
  STORAGE_ACCESS_KEY_ID: 'openapi',
  STORAGE_SECRET_ACCESS_KEY: 'openapi',
  STORAGE_PUBLIC_URL: 'http://localhost:9000/openapi',
});

const { AppModule } = await import('./app.module.js');

const app = await NestFactory.create(AppModule, {
  preview: true,
  logger: ['error'],
});
app.setGlobalPrefix('api');

const output = process.argv[2] ?? 'openapi.json';
await writeFile(
  output,
  `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`,
);
await app.close();
