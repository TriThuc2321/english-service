import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  AttemptEvidenceDto,
  AttemptResultDto,
} from './dto/student-attempt-response.dto.js';

import { AttemptAnswer } from '../../entities/attempt-answer.entity.js';
import { Attempt } from '../../entities/attempt.entity.js';
import { Media } from '../../entities/media.entity.js';
import { AttemptErrorCode, AttemptStatus } from '../../types/attempt.type.js';
import { StudentTestsService } from '../student-tests/student-tests.service.js';
import { maxScoreOf } from './attempt-grader.js';
import { AttemptTreeService } from './attempt-tree.service.js';
import { toListItemDto } from './attempt.mapper.js';

const fail = (status: HttpStatus, code: AttemptErrorCode, message: string) =>
  new HttpException({ message, code }, status);

@Injectable()
export class AttemptResultService {
  constructor(
    @InjectRepository(Attempt)
    private readonly attemptRepository: Repository<Attempt>,
    @InjectRepository(AttemptAnswer)
    private readonly answerRepository: Repository<AttemptAnswer>,
    @InjectRepository(Media)
    private readonly mediaRepository: Repository<Media>,
    private readonly treeService: AttemptTreeService,
    private readonly studentTestsService: StudentTestsService,
  ) {}

  async content(userId: string, id: string) {
    const attempt = await this.attemptRepository
      .createQueryBuilder('a')
      .leftJoin('a.attemptSections', 's')
      .select(['a.id', 'a.testId', 's.id', 's.sectionId'])
      .where('a.id = :id AND a.userId = :userId', { id, userId })
      .getOne();
    const content =
      attempt &&
      (await this.studentTestsService.findContent(
        attempt.testId,
        attempt.attemptSections.map((s) => s.sectionId),
      ));
    if (!content) {
      throw fail(
        HttpStatus.NOT_FOUND,
        AttemptErrorCode.ATTEMPT_NOT_FOUND,
        'Attempt not found',
      );
    }
    return content;
  }

  async result(userId: string, id: string): Promise<AttemptResultDto> {
    const attempt = await this.attemptRepository
      .createQueryBuilder('a')
      .innerJoin('a.test', 't')
      .leftJoin('a.attemptSections', 's')
      .leftJoin('s.testSection', 'ts')
      .select([
        'a.id',
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
      ])
      .where('a.id = :id AND a.userId = :userId', { id, userId })
      .getOne();
    if (!attempt) {
      throw fail(
        HttpStatus.NOT_FOUND,
        AttemptErrorCode.ATTEMPT_NOT_FOUND,
        'Attempt not found',
      );
    }
    if (
      attempt.status !== AttemptStatus.GRADED &&
      attempt.status !== AttemptStatus.EXPIRED
    ) {
      throw fail(
        HttpStatus.CONFLICT,
        AttemptErrorCode.ATTEMPT_NOT_GRADED,
        'Attempt is not graded yet',
      );
    }

    const tree = await this.treeService.get(attempt.testId);
    const sectionOrder = new Map(
      tree.sections.map((s) => [s.sectionId, s.order]),
    );
    const sectionIds = attempt.attemptSections.map((s) => s.sectionId);

    const rows = await this.answerRepository
      .createQueryBuilder('aa')
      .innerJoin('aa.question', 'q')
      .select([
        'aa.questionId',
        'aa.response',
        'aa.isCorrect',
        'aa.score',
        'aa.flagged',
        'q.id',
        'q.numberFrom',
        'q.numberTo',
      ])
      .addSelect(['q.answer', 'q.explanation', 'q.evidence'])
      .where('aa.attemptId = :id', { id })
      .getMany();

    const questions = rows
      .flatMap((row) => {
        const sectionId = tree.questions.get(row.questionId)?.sectionId;
        return sectionId === undefined ? [] : [{ row, sectionId }];
      })
      .sort(
        (a, b) =>
          (sectionOrder.get(a.sectionId) ?? 0) -
            (sectionOrder.get(b.sectionId) ?? 0) ||
          a.row.question.numberFrom - b.row.question.numberFrom,
      )
      .map(({ row, sectionId }) => ({
        questionId: row.questionId,
        sectionId,
        numberFrom: row.question.numberFrom,
        numberTo: row.question.numberTo,
        response: row.response ?? null,
        isCorrect: row.isCorrect ?? null,
        score: row.score ?? 0,
        maxScore: maxScoreOf(row.question),
        flagged: row.flagged,
        answer: row.question.answer,
        explanation: row.question.explanation ?? null,
        evidence: (row.question.evidence as AttemptEvidenceDto | null) ?? null,
      }));

    const mediaIds = [
      ...new Set(sectionIds.flatMap((s) => tree.mediaIds.get(s) ?? [])),
    ];
    const media = mediaIds.length
      ? await this.mediaRepository
          .createQueryBuilder('m')
          .select(['m.id', 'm.transcript'])
          .where('m.id IN (:...mediaIds)', { mediaIds })
          .andWhere('m.transcript IS NOT NULL')
          .orderBy('m.id', 'ASC')
          .getMany()
      : [];

    return {
      attempt: toListItemDto(attempt),
      questions,
      transcripts: media.map((m) => ({
        mediaId: m.id,
        transcript: m.transcript ?? '',
      })),
    };
  }
}
