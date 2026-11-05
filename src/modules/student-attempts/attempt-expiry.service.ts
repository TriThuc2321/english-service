import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Attempt } from '../../entities/attempt.entity.js';
import { AttemptStatus } from '../../types/attempt.type.js';
import { GRACE_MS } from './attempt-timeline.js';
import { StudentAttemptsService } from './student-attempts.service.js';

const MAX_EXPIRED_PER_SWEEP = 50;

@Injectable()
export class AttemptExpiryService {
  private readonly logger = new Logger(AttemptExpiryService.name);

  constructor(
    @InjectRepository(Attempt)
    private readonly attemptRepository: Repository<Attempt>,
    private readonly attempts: StudentAttemptsService,
  ) {}

  async expireOverdue(now = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - GRACE_MS);
    const overdue = await this.attemptRepository
      .createQueryBuilder('a')
      .select(['a.id', 'a.userId'])
      .where(
        `a.status = :status AND (a.deadlineAt < :cutoff OR EXISTS (
          SELECT 1 FROM attempt_sections s
           WHERE s.attempt_id = a.attempt_id
             AND s.status = 'IN_PROGRESS'
             AND s.deadline_at < :cutoff))`,
        { status: AttemptStatus.IN_PROGRESS, cutoff },
      )
      .orderBy('a.startedAt', 'ASC')
      .limit(MAX_EXPIRED_PER_SWEEP)
      .getMany();

    for (const { id, userId } of overdue) {
      try {
        await this.attempts.expireIfOverdue(userId, id);
      } catch (error) {
        this.logger.warn(
          `Could not close overdue attempt ${id}: ${(error as Error).message}`,
        );
      }
    }
  }
}
