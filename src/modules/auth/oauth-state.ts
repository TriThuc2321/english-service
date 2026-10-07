import { randomBytes, timingSafeEqual } from 'node:crypto';

import { AuthClient, isAuthClient } from '../../types/auth.type.js';

const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export interface OAuthState {
  client: AuthClient;
  nonce: string;
  clientNonce?: string;
}

export const isValidNonce = (value: unknown): value is string =>
  typeof value === 'string' && NONCE_PATTERN.test(value);

export const generateNonce = () => randomBytes(16).toString('base64url');

export const serializeOAuthState = ({
  client,
  nonce,
  clientNonce,
}: OAuthState) => [client, nonce, clientNonce].filter(Boolean).join('.');

export function parseOAuthState(value: unknown): OAuthState | undefined {
  if (typeof value !== 'string') return undefined;

  const [client, nonce, clientNonce, ...rest] = value.split('.');
  if (
    rest.length ||
    !isAuthClient(client) ||
    !isValidNonce(nonce) ||
    (clientNonce !== undefined && !isValidNonce(clientNonce))
  ) {
    return undefined;
  }
  return { client, nonce, clientNonce };
}

export function nonceMatches(expected: unknown, actual: string) {
  if (typeof expected !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
