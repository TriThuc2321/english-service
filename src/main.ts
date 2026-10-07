import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { getHttpsOptions, getLocalDomain } from './configs/common.config.js';
import { configSwagger, SWAGGER_PATH } from './configs/swagger.config.js';

async function bootstrap() {
  const httpsOptions = getHttpsOptions();
  const APP_PORT = Number(process.env.APP_PORT ?? 8080);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    httpsOptions,
  });

  const configService = app.get(ConfigService);

  const trustProxy = configService.get<string>('TRUST_PROXY');
  if (trustProxy) {
    // Lets the throttler key on the real client IP forwarded by the student
    // BFF / load balancer instead of the proxy's own address.
    app.set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
  }

  app.use(helmet());
  app.use(cookieParser());
  app.use(
    `/${SWAGGER_PATH}`,
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
        },
      },
    }),
  );
  app.enableCors({
    origin: configService.get<string[]>('cors.origins'),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

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
