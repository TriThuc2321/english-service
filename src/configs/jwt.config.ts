import type { JwtSignOptions } from '@nestjs/jwt';

import { ConfigType, registerAs } from '@nestjs/config';

type ExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET as string,
  secretRefresh: process.env.JWT_SECRET_REFRESH as string,
  expiresIn: (process.env.JWT_EXPIRES_IN ?? '5m') as ExpiresIn,
  refreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as ExpiresIn,
}));

export type JWTConfig = ConfigType<typeof jwtConfig>;
