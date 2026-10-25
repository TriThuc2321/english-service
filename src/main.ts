import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { getHttpsOptions, getLocalDomain } from './configs/common.config.js';
import { configSwagger, SWAGGER_PATH } from './configs/swagger.config.js';

async function bootstrap() {
  const httpsOptions = getHttpsOptions();
  const APP_PORT = Number(process.env.APP_PORT ?? 8080);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    httpsOptions,
  });

  configureApp(app);
  configSwagger(app);

  await app.listen(APP_PORT, '0.0.0.0', () => {
    const LOCAL_DOMAIN = httpsOptions
      ? `https://${getLocalDomain()}`
      : 'http://localhost';

    Logger.log(`API run on ${LOCAL_DOMAIN}:${APP_PORT}/api`);
    Logger.log(`API docs on ${LOCAL_DOMAIN}:${APP_PORT}/${SWAGGER_PATH}`);
  });
}
await bootstrap();
