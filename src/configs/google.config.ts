import { ConfigType, registerAs } from '@nestjs/config';

import { AuthClient } from '../types/auth.type.js';

export const googleConfig = registerAs('google', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID as string,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
  callbackUrl: process.env.GOOGLE_CALLBACK_URL as string,
  loginRedirectUrls: {
    [AuthClient.WEB]: process.env.GOOGLE_LOGIN_REDIRECT_URL_WEB as string,
    [AuthClient.BO]: process.env.GOOGLE_LOGIN_REDIRECT_URL_BO as string,
  } satisfies Record<AuthClient, string>,
}));

export type GoogleConfig = ConfigType<typeof googleConfig>;
