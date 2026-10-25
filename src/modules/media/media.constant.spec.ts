import { randomUUID } from 'node:crypto';

import { MediaKind } from '../../types/media.type.js';
import { MEDIA_KEY_PATTERN, mediaKeyPrefix } from './media.constant.js';

describe('media keys', () => {
  const uuid = randomUUID();

  it('builds a prefix with the lowercased kind', () => {
    expect(mediaKeyPrefix('tests', '12', MediaKind.AUDIO)).toBe(
      'tests/12/audio/',
    );
  });

  it('accepts keys built from the prefix', () => {
    const ownerId = randomUUID();

    expect(
      MEDIA_KEY_PATTERN.test(
        `${mediaKeyPrefix('avatars', ownerId, MediaKind.IMAGE)}${uuid}.webp`,
      ),
    ).toBe(true);
  });

  it('builds an owner-less prefix', () => {
    expect(mediaKeyPrefix('library', null, MediaKind.AUDIO)).toBe(
      'library/audio/',
    );
    expect(
      MEDIA_KEY_PATTERN.test(
        `${mediaKeyPrefix('library', undefined, MediaKind.IMAGE)}${uuid}.png`,
      ),
    ).toBe(true);
  });

  it.each([
    ['an unknown kind', `tests/12/video/${uuid}.mp4`],
    ['a missing extension', `tests/12/audio/${uuid}`],
    ['a non-uuid file name', 'tests/12/audio/file.mp3'],
    ['path traversal', `tests/../audio/${uuid}.mp3`],
    ['an extra path segment', `tests/12/x/audio/${uuid}.mp3`],
    ['an uppercase prefix', `Tests/12/audio/${uuid}.mp3`],
  ])('rejects %s', (_, key) => {
    expect(MEDIA_KEY_PATTERN.test(key)).toBe(false);
  });
});
