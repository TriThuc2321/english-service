import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaKind, MediaScope } from '../../types/media.type.js';
import { MediaPolicyRegistry } from './media-policy.registry.js';
import { MediaService } from './media.service.js';

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000001';

describe('MediaService private media', () => {
  let service: MediaService;
  let storage: {
    uploadUrlTtl: number;
    cacheControl: string;
    privateCacheControl: string;
    getUploadUrl: Mock<(key: string, ...rest: string[]) => Promise<string>>;
    getPublicUrl: Mock<(key: string) => string>;
    getDownloadUrl: Mock<(key: string) => Promise<string>>;
  };

  beforeEach(() => {
    storage = {
      uploadUrlTtl: 600,
      cacheControl: 'public, max-age=31536000, immutable',
      privateCacheControl: 'private',
      getUploadUrl: vi.fn<(key: string, ...rest: string[]) => Promise<string>>(
        async (key) => `http://upload.test/${key}`,
      ),
      getPublicUrl: vi.fn<(key: string) => string>(
        (key) => `http://storage.test/${key}`,
      ),
      getDownloadUrl: vi.fn<(key: string) => Promise<string>>(
        async (key) => `http://signed.test/${key}`,
      ),
    };
    const registry = new MediaPolicyRegistry();
    registry.register({
      scope: MediaScope.ATTEMPT,
      prefix: 'attempts',
      maxBytes: { [MediaKind.AUDIO]: 1024 },
      privateRead: true,
      assertOwnerWritable: async () => {},
    });
    registry.register({
      scope: MediaScope.TEST,
      prefix: 'tests',
      maxBytes: { [MediaKind.AUDIO]: 1024 },
      assertOwnerWritable: async () => {},
    });
    service = new MediaService({} as never, storage as never, registry);
  });

  it('signs a URL for a privateRead scope', async () => {
    await expect(
      service.getUrl({
        scope: MediaScope.ATTEMPT,
        storageKey: 'attempts/a/audio/k.webm',
      }),
    ).resolves.toBe('http://signed.test/attempts/a/audio/k.webm');
    expect(storage.getPublicUrl).not.toHaveBeenCalled();
  });

  it('keeps public URLs for other scopes', async () => {
    await expect(
      service.getUrl({
        scope: MediaScope.TEST,
        storageKey: 'tests/1/audio/k.mp3',
      }),
    ).resolves.toBe('http://storage.test/tests/1/audio/k.mp3');
  });

  it('uploads private scopes with Cache-Control: private', async () => {
    const res = await service.createUploadUrl({
      scope: MediaScope.ATTEMPT,
      ownerId: ATTEMPT_ID,
      kind: MediaKind.AUDIO,
      contentType: 'audio/webm',
    });
    expect(res.headers['Cache-Control']).toBe('private');
    expect(storage.getUploadUrl).toHaveBeenCalledWith(
      res.storageKey,
      'audio/webm',
      'private',
    );
  });
});
