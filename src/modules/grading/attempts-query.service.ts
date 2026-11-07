import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { Attempt } from '../../entities/attempt.entity.js';
import { PaginationDto } from '../../shared/dto/index.js';
import { AttemptErrorCode } from '../../types/attempt.type.js';
import { AttemptExpiryService } from '../student-attempts/attempt-expiry.service.js';
import {
  attemptListQuery,
  paginateAttempts,
} from '../student-attempts/attempt-list.query.js';
import { AttemptResultService } from '../student-attempts/attempt-result.service.js';
import { StudentAttemptsService } from '../student-attempts/student-attempts.service.js';
import {
  StudentAttemptItemDto,
  StudentAttemptResultDto,
} from './dto/attempts-response.dto.js';
import { ListAttemptsQueryDto } from './dto/attempts.dto.js';
import { toUserDto } from './grading-query.service.js';

const USER_COLUMNS = ['u.id', 'u.email', 'u.firstName', 'u.lastName'];

@Injectable()
export class AttemptsQueryService {
  constructor(
    @InjectRepository(Attempt)
    private readonly attemptRepository: Repository<Attempt>,
    private readonly expiry: AttemptExpiryService,
    private readonly attempts: StudentAttemptsService,
    private readonly results: AttemptResultService,
  ) {}

  async findAll({
    page,
    take,
    userId,
    testId,
    status,
    examType,
    search,
  }: ListAttemptsQueryDto): Promise<PaginationDto<StudentAttemptItemDto>> {
    await this.expiry.expireOverdue();

    const qb = attemptListQuery(this.attemptRepository)
      .innerJoin('a.user', 'u')
      .addSelect(USER_COLUMNS);
    if (userId) qb.andWhere('a.userId = :userId', { userId });
    if (testId) qb.andWhere('a.testId = :testId', { testId });
    if (status) qb.andWhere('a.status = :status', { status });
    if (examType) qb.andWhere('t.examType = :examType', { examType });
    if (search) {
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('u.email ILIKE :search')
            .orWhere('u.firstName ILIKE :search')
            .orWhere('u.lastName ILIKE :search'),
        ),
        { search: `%${search}%` },
      );
    }

    return paginateAttempts(qb, page, take, (item, attempt) => ({
      ...item,
      student: toUserDto(attempt.user),
    }));
  }

  async result(id: string): Promise<StudentAttemptResultDto> {
    const attempt = await this.findWithUser(id);
    await this.attempts.expireIfOverdue(attempt.userId, id);
    return {
      ...(await this.results.result(attempt.userId, id)),
      student: toUserDto(attempt.user),
    };
  }

  async content(id: string) {
    const attempt = await this.findWithUser(id);
    return this.results.content(attempt.userId, id);
  }

  private async findWithUser(id: string): Promise<Attempt> {
    const attempt = await this.attemptRepository
      .createQueryBuilder('a')
      .innerJoin('a.user', 'u')
      .select(['a.id', 'a.userId', ...USER_COLUMNS])
      .where('a.id = :id', { id })
      .getOne();
    if (!attempt) {
      throw new HttpException(
        {
          message: 'Attempt not found',
          code: AttemptErrorCode.ATTEMPT_NOT_FOUND,
        },
        HttpStatus.NOT_FOUND,
      );
    }
    return attempt;
  }
}
