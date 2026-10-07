import type { CookieOptions, Response } from 'express';

import type { AuthClient } from '../../types/auth.type.js';

const REFRESH_COOKIE_PATH = '/api/auth';

const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'none',
  path: REFRESH_COOKIE_PATH,
};

export const refreshCookieName = (client: AuthClient) =>
  `refresh_token_${client}`;

export function setRefreshTokenCookie(
  res: Response,
  client: AuthClient,
  token: string,
  expiresAt: Date,
) {
  res.cookie(refreshCookieName(client), token, {
    ...baseOptions,
    expires: expiresAt,
  });
}

export function clearRefreshTokenCookie(res: Response, client: AuthClient) {
  res.clearCookie(refreshCookieName(client), baseOptions);
}
