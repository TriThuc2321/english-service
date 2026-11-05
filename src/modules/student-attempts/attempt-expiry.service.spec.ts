import type { Repository } from 'typeorm';

import { Attempt } from '../../entities/attempt.entity.js';
import { AttemptExpiryService } from './attempt-expiry.service.js';
import { StudentAttemptsService } from './student-attempts.service.js';

describe('AttemptExpiryService', () => {
  const getMany = vi.fn<() => Promise<unknown>>();
  const query = {
    select: vi.fn<(...args: unknown[]) => unknown>(),
    where: vi.fn<(...args: unknown[]) => unknown>(),
    orderBy: vi.fn<(...args: unknown[]) => unknown>(),
    limit: vi.fn<(...args: unknown[]) => unknown>(),
    getMany,
  };
  for (const key of ['select', 'where', 'orderBy', 'limit'] as const) {
    query[key].mockReturnValue(query);
  }
  const repository = {
    createQueryBuilder: vi.fn<() => unknown>(() => query),
  } as unknown as Repository<Attempt>;
  const attempts = {
    expireIfOverdue: vi.fn<(userId: string, id: string) => Promise<void>>(),
  };
  const service = new AttemptExpiryService(
    repository,
    attempts as unknown as StudentAttemptsService,
  );

  const overdue = (rows: Array<{ id: string; userId: string }>) =>
    getMany.mockResolvedValue(rows);

  beforeEach(() => {
    attempts.expireIfOverdue.mockReset().mockResolvedValue(undefined);
  });

  it('expires each overdue attempt for its owner', async () => {
    overdue([
      { id: 'a', userId: 'u1' },
      { id: 'b', userId: 'u2' },
    ]);
    await service.expireOverdue();
    expect(attempts.expireIfOverdue.mock.calls).toEqual([
      ['u1', 'a'],
      ['u2', 'b'],
    ]);
  });

  it('keeps going when one attempt fails', async () => {
    overdue([
      { id: 'a', userId: 'u1' },
      { id: 'b', userId: 'u2' },
    ]);
    attempts.expireIfOverdue.mockRejectedValueOnce(new Error('boom'));
    await expect(service.expireOverdue()).resolves.toBeUndefined();
    expect(attempts.expireIfOverdue).toHaveBeenCalledWith('u2', 'b');
  });

  it('only looks at attempts older than the grace period', async () => {
    overdue([]);
    const now = new Date('2026-01-01T00:00:00Z');
    await service.expireOverdue(now);
    expect(query.where).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cutoff: new Date('2025-12-31T23:59:30Z'),
      }),
    );
  });
});
