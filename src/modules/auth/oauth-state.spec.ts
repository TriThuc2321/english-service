import { AuthClient } from '../../types/auth.type.js';
import {
  generateNonce,
  isValidNonce,
  nonceMatches,
  parseOAuthState,
  serializeOAuthState,
} from './oauth-state.js';

describe('oauth-state', () => {
  const nonce = generateNonce();
  const clientNonce = 'client_nonce-1234567890';

  it('generates nonces that pass validation', () => {
    expect(isValidNonce(nonce)).toBe(true);
    expect(generateNonce()).not.toBe(nonce);
  });

  it.each([
    { client: AuthClient.BO, nonce },
    { client: AuthClient.WEB, nonce, clientNonce },
  ])('round-trips $client state', (state) => {
    expect(parseOAuthState(serializeOAuthState(state))).toEqual(state);
  });

  it.each([
    ['a non-string', 42],
    ['an unknown client', `admin.${nonce}`],
    ['a missing nonce', 'bo'],
    ['a short nonce', 'bo.short'],
    ['a nonce with invalid characters', `bo.${'a'.repeat(15)}!`],
    ['an invalid client nonce', `web.${nonce}.bad`],
    ['extra segments', `web.${nonce}.${clientNonce}.${clientNonce}`],
  ])('rejects %s', (_, value) => {
    expect(parseOAuthState(value)).toBeUndefined();
  });

  describe('nonceMatches', () => {
    it('matches equal nonces', () => {
      expect(nonceMatches(nonce, nonce)).toBe(true);
    });

    it.each([
      ['a different nonce', generateNonce()],
      ['a different length', `${nonce}x`],
    ])('rejects %s', (_, actual) => {
      expect(nonceMatches(nonce, actual)).toBe(false);
    });

    it('rejects a missing cookie', () => {
      expect(nonceMatches(undefined, nonce)).toBe(false);
    });
  });
});
