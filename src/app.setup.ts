import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { SWAGGER_PATH } from './configs/swagger.config.js';

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
}
