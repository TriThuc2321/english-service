import type { CookieOptions, Response } from 'express';

import type { AuthClient } from '../../types/auth.type.js';

const REFRESH_COOKIE_PATH = '/api/auth';
const OAUTH_STATE_COOKIE_PATH = '/api/auth/google';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export const OAUTH_STATE_COOKIE = 'oauth_state';

const secureOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
};

const refreshOptions: CookieOptions = {
  ...secureOptions,
  path: REFRESH_COOKIE_PATH,
};

const oauthStateOptions: CookieOptions = {
  ...secureOptions,
  path: OAUTH_STATE_COOKIE_PATH,
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
    ...refreshOptions,
    expires: expiresAt,
  });
}

export function clearRefreshTokenCookie(res: Response, client: AuthClient) {
  res.clearCookie(refreshCookieName(client), refreshOptions);
}

export function setOAuthStateCookie(res: Response, nonce: string) {
  res.cookie(OAUTH_STATE_COOKIE, nonce, {
    ...oauthStateOptions,
    maxAge: OAUTH_STATE_MAX_AGE_MS,
  });
}

export function clearOAuthStateCookie(res: Response) {
  res.clearCookie(OAUTH_STATE_COOKIE, oauthStateOptions);
}
