import type { Repository, SelectQueryBuilder } from 'typeorm';

import type { AttemptListItemDto } from './dto/student-attempt-response.dto.js';

import { Attempt } from '../../entities/attempt.entity.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import { toListItemDto } from './attempt.mapper.js';

export const attemptListQuery = (repository: Repository<Attempt>) =>
  repository
    .createQueryBuilder('a')
    .innerJoin('a.test', 't')
    .leftJoin('a.attemptSections', 's')
    .leftJoin('s.testSection', 'ts')
    .select([
      'a.id',
      'a.userId',
      'a.testId',
      'a.mode',
      'a.status',
      'a.startedAt',
      'a.deadlineAt',
      'a.submittedAt',
      'a.overallScore',
      't.id',
      't.slug',
      't.title',
      't.examType',
      's',
      'ts.id',
      'ts.skill',
      'ts.order',
    ]);

export async function paginateAttempts<T>(
  qb: SelectQueryBuilder<Attempt>,
  page: number,
  take: number,
  map: (item: AttemptListItemDto, attempt: Attempt) => T,
): Promise<PaginationDto<T>> {
  const [attempts, totalCount] = await qb
    .orderBy('a.startedAt', 'DESC')
    .addOrderBy('a.id', 'DESC')
    .skip((page - 1) * take)
    .take(take)
    .getManyAndCount();

  return new PaginationDto(
    attempts.map((a) => map(toListItemDto(a), a)),
    new PageMetaDto({ page, take, totalCount }),
  );
}
