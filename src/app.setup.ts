import type { RequestHandler } from 'express';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import * as helmetModule from 'helmet';
import { contentSecurityPolicy, type HelmetOptions } from 'helmet';

import { SWAGGER_PATH } from './configs/swagger.config.js';

type HelmetFn = (options?: Readonly<HelmetOptions>) => RequestHandler;

// Vercel type-checks with CJS resolution, where the default import is typed as a
// namespace object instead of the callable.
const helmet: HelmetFn =
  (helmetModule as unknown as { default?: HelmetFn }).default ??
  (helmetModule as unknown as HelmetFn);

export function configureApp(app: NestExpressApplication) {
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
          ...contentSecurityPolicy.getDefaultDirectives(),
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
}
