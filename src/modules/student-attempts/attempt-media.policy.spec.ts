import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { MediaKind, MediaScope } from '../../types/media.type.js';
import { AttemptMediaPolicy } from './attempt-media.policy.js';

const setup = (exists: boolean) => {
  const repo = { existsBy: vi.fn<() => Promise<boolean>>(async () => exists) };
  const registry = { register: vi.fn<() => void>() };
  const policy = new AttemptMediaPolicy(registry as never, repo as never);
  return { policy, repo };
};

describe('AttemptMediaPolicy', () => {
  it('is private, audio only, 20 MB', () => {
    expect(setup(true).policy).toMatchObject({
      scope: MediaScope.ATTEMPT,
      prefix: 'attempts',
      privateRead: true,
      maxBytes: { [MediaKind.AUDIO]: 20 * 1024 * 1024 },
    });
  });

  it('accepts an IN_PROGRESS attempt', async () => {
    await expect(
      setup(true).policy.assertOwnerWritable(randomUUID()),
    ).resolves.toBeUndefined();
  });

  it('rejects a closed attempt', async () => {
    await expect(
      setup(false).policy.assertOwnerWritable(randomUUID()),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects an owner that is not a uuid', async () => {
    const { policy, repo } = setup(true);
    await expect(policy.assertOwnerWritable('nope')).rejects.toThrow(
      BadRequestException,
    );
    await expect(policy.assertOwnerWritable(undefined)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.existsBy).not.toHaveBeenCalled();
  });
});
