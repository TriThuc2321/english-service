import type { IncomingMessage, ServerResponse } from 'node:http';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { getHttpsOptions, getLocalDomain } from './configs/common.config.js';
import { configSwagger, SWAGGER_PATH } from './configs/swagger.config.js';

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

async function createApp(httpsOptions = getHttpsOptions()) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    httpsOptions,
    abortOnError: false,
  });

  configureApp(app);
  configSwagger(app);

  return app;
}

async function bootstrap() {
  const httpsOptions = getHttpsOptions();
  const APP_PORT = Number(process.env.APP_PORT ?? 8080);
  const app = await createApp(httpsOptions);

  await app.listen(APP_PORT, '0.0.0.0', () => {
    const LOCAL_DOMAIN = httpsOptions
      ? `https://${getLocalDomain()}`
      : 'http://localhost';

    Logger.log(`API run on ${LOCAL_DOMAIN}:${APP_PORT}/api`);
    Logger.log(`API docs on ${LOCAL_DOMAIN}:${APP_PORT}/${SWAGGER_PATH}`);
  });
}

let handlerPromise: Promise<RequestHandler> | undefined;

const initHandler = async (): Promise<RequestHandler> => {
  const app = await createApp(undefined);
  await app.init();
  return app.getHttpAdapter().getInstance();
};

// Vercel imports this module and stubs http.Server#listen without ever firing
// its callback, so awaiting app.listen() here deadlocks the import. It also
// gives up on a listen() that comes later than 1s, which a cold start with DB
// seeding exceeds — hence a lazily-initialised (req, res) export instead.
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  handlerPromise ??= initHandler().catch((error: unknown) => {
    handlerPromise = undefined;
    console.error('Bootstrap failed:', error);
    throw error;
  });
  const app = await handlerPromise;
  app(req, res);
}

if (import.meta.main) {
  try {
    await bootstrap();
  } catch (error) {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  }
}
