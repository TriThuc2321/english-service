import { BadRequestException } from '@nestjs/common';

import type { IMediaOwnerPolicy } from './media-policy.js';

import { MediaKind, MediaScope } from '../../types/media.type.js';
import { MediaPolicyRegistry } from './media-policy.registry.js';
import { MB } from './media.constant.js';

const policy = (
  scope: MediaScope,
  prefix: string,
  maxBytes: IMediaOwnerPolicy['maxBytes'] = { [MediaKind.IMAGE]: MB },
): IMediaOwnerPolicy => ({
  scope,
  prefix,
  maxBytes,
  assertOwnerWritable: async () => {},
});

describe('MediaPolicyRegistry', () => {
  let registry: MediaPolicyRegistry;

  beforeEach(() => {
    registry = new MediaPolicyRegistry();
  });

  it('returns a registered policy and its size limit', () => {
    const avatar = policy(MediaScope.AVATAR, 'avatars');
    registry.register(avatar);

    expect(registry.get(MediaScope.AVATAR)).toBe(avatar);
    expect(registry.getForKind(MediaScope.AVATAR, MediaKind.IMAGE)).toEqual({
      policy: avatar,
      maxBytes: MB,
    });
  });

  it('rejects a second policy for the same scope', () => {
    registry.register(policy(MediaScope.AVATAR, 'avatars'));

    expect(() => registry.register(policy(MediaScope.AVATAR, 'other'))).toThrow(
      /already registered/,
    );
  });

  it('rejects a key prefix already used by another scope', () => {
    registry.register(policy(MediaScope.AVATAR, 'shared'));

    expect(() => registry.register(policy(MediaScope.TEST, 'shared'))).toThrow(
      /already in use/,
    );
  });

  it('rejects an unregistered scope', () => {
    expect(() => registry.get(MediaScope.TEST)).toThrow(BadRequestException);
  });

  it('rejects a kind the scope does not allow', () => {
    registry.register(policy(MediaScope.AVATAR, 'avatars'));

    expect(() =>
      registry.getForKind(MediaScope.AVATAR, MediaKind.AUDIO),
    ).toThrow(BadRequestException);
  });
});
