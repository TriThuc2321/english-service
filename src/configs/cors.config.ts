import { registerAs } from '@nestjs/config';

export const corsConfig = registerAs('cors', () => ({
  origins:
    process.env.CORS_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [],
}));
