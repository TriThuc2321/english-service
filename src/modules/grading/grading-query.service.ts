import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, In } from 'typeorm';

import type { IAssessmentEntry } from '../../types/attempt.type.js';

import { Assessment } from '../../entities/assessment.entity.js';
import { AttemptAnswer } from '../../entities/attempt-answer.entity.js';
import { AttemptSection } from '../../entities/attempt-section.entity.js';
import { Media } from '../../entities/media.entity.js';
import { TestPart } from '../../entities/test-part.entity.js';
import { User } from '../../entities/user.entity.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import { findLatestAssessments } from '../../shared/scoring/latest-assessments.js';
import { AttemptSectionGradingStatus } from '../../types/attempt.type.js';
import { MediaService } from '../media/media.service.js';
import { countWords, normalizeText } from '../questions/answer-text.js';
import { AttemptExpiryService } from '../student-attempts/attempt-expiry.service.js';
import {
  AssessmentDto,
  GradingPartDto,
  GradingQueueItemDto,
  GradingResponseDto,
  GradingSectionDto,
  GradingUserDto,
} from './dto/grading-response.dto.js';
import { ListGradingQueueDto } from './dto/grading.dto.js';
import { expectedEntriesOf } from './grading-entries.js';

const toUserDto = (u: User): GradingUserDto => ({
  id: u.id,
  email: u.email ?? null,
  firstName: u.firstName ?? null,
  lastName: u.lastName ?? null,
});

const toAssessmentDto = (a: Assessment, grader: User): AssessmentDto => ({
  id: a.id,
  revision: a.revision,
  band: a.band,
  entries: a.details.entries as IAssessmentEntry[],
  grader: toUserDto(grader),
  createdAt: a.createdAt.toISOString(),
});

@Injectable()
export class GradingQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly expiry: AttemptExpiryService,
    private readonly mediaService: MediaService,
  ) {}

  async findQueue({
    page,
    take,
    gradingStatus,
    skill,
    testId,
    search,
  }: ListGradingQueueDto): Promise<PaginationDto<GradingQueueItemDto>> {
    await this.expiry.expireOverdue();

    const qb = this.dataSource
      .getRepository(AttemptSection)
      .createQueryBuilder('s')
      .innerJoin('s.attempt', 'a')
      .innerJoin('a.user', 'u')
      .innerJoin('a.test', 't')
      .innerJoin('s.testSection', 'ts')
      .select([
        's.id',
        's.attemptId',
        's.submittedAt',
        's.gradingStatus',
        'a.id',
        'u.id',
        'u.email',
        'u.firstName',
        'u.lastName',
        't.id',
        't.title',
        't.examType',
        'ts.id',
        'ts.skill',
      ])
      .where('s.gradingStatus = :gradingStatus', { gradingStatus });
    if (skill) qb.andWhere('ts.skill = :skill', { skill });
    if (testId !== undefined) qb.andWhere('a.testId = :testId', { testId });
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

    const [sections, totalCount] = await qb
      .orderBy('s.submittedAt', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .skip((page - 1) * take)
      .take(take)
      .getManyAndCount();

    const latest = await findLatestAssessments(
      this.dataSource.manager,
      sections.map((s) => s.id),
    );
    const graders = await this.loadUsers(
      [...latest.values()].map((a) => a.graderId),
    );

    const data = sections.map((s): GradingQueueItemDto => {
      const assessment = latest.get(s.id);
      return {
        attemptSectionId: s.id,
        attemptId: s.attemptId,
        student: toUserDto(s.attempt.user),
        test: {
          id: s.attempt.test.id,
          title: s.attempt.test.title,
          examType: s.attempt.test.examType,
        },
        skill: s.testSection.skill,
        submittedAt: s.submittedAt?.toISOString() ?? null,
        gradingStatus: s.gradingStatus!,
        band: assessment?.band ?? null,
        grader: assessment
          ? toUserDto(graders.get(assessment.graderId)!)
          : null,
      };
    });
    return new PaginationDto(data, new PageMetaDto({ page, take, totalCount }));
  }

  async findSection(id: string): Promise<GradingSectionDto> {
    const section = await this.dataSource
      .getRepository(AttemptSection)
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.attempt', 'a')
      .innerJoinAndSelect('a.user', 'u')
      .innerJoinAndSelect('a.test', 't')
      .innerJoinAndSelect('s.testSection', 'ts')
      .where('s.id = :id', { id })
      .getOne();
    if (
      !section ||
      (section.gradingStatus !== AttemptSectionGradingStatus.PENDING &&
        section.gradingStatus !== AttemptSectionGradingStatus.GRADED)
    ) {
      throw new NotFoundException('Attempt section not found');
    }

    const parts = await this.dataSource
      .getRepository(TestPart)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.questionGroups', 'g')
      .leftJoinAndSelect('g.questions', 'q')
      .addSelect('q.answer')
      .where('p.sectionId = :sectionId', { sectionId: section.sectionId })
      .orderBy('p.order', 'ASC')
      .addOrderBy('g.order', 'ASC')
      .addOrderBy('q.order', 'ASC')
      .getMany();

    const questions = parts.flatMap((p) =>
      p.questionGroups.flatMap((g) => g.questions.map((q) => ({ p, g, q }))),
    );
    const answers = questions.length
      ? await this.dataSource.getRepository(AttemptAnswer).find({
          where: {
            attemptId: section.attemptId,
            questionId: In(questions.map(({ q }) => q.id)),
          },
        })
      : [];
    const answerOf = new Map(answers.map((a) => [a.questionId, a]));

    const mediaIds = [
      ...new Set(
        questions.flatMap(({ p, g, q }) =>
          [
            q.imageMediaId ?? g.imageMediaId,
            q.audioMediaId ?? g.audioMediaId ?? p.audioMediaId,
          ].filter((m): m is number => typeof m === 'number'),
        ),
      ),
    ];
    const mediaUrls = new Map<number, string>();
    if (mediaIds.length) {
      const rows = await this.dataSource
        .getRepository(Media)
        .findBy({ id: In(mediaIds) });
      for (const media of rows) {
        mediaUrls.set(media.id, await this.mediaService.getUrl(media));
      }
    }
    const urlOf = (mediaId?: number | null) =>
      (mediaId != null && mediaUrls.get(mediaId)) || null;

    const skill = section.testSection.skill;
    const partDtos = parts.map((p): GradingPartDto => ({
      partId: p.id,
      order: p.order,
      title: p.title ?? null,
      instruction: p.instruction ?? null,
      questions: p.questionGroups.flatMap((g) =>
        g.questions.map((q) => {
          const answer = q.answer as {
            sample?: unknown;
            rubric?: unknown;
          } | null;
          return {
            questionId: q.id,
            numberFrom: q.numberFrom,
            questionType: g.questionType,
            instruction: g.instruction ?? null,
            prompt: q.prompt ?? null,
            content: q.content ?? null,
            imageUrl: urlOf(q.imageMediaId ?? g.imageMediaId),
            audioUrl: urlOf(q.audioMediaId ?? g.audioMediaId ?? p.audioMediaId),
            sample: typeof answer?.sample === 'string' ? answer.sample : null,
            rubric:
              answer?.rubric && typeof answer.rubric === 'object'
                ? (answer.rubric as Record<string, unknown>)
                : null,
            response: toResponse(answerOf.get(q.id)),
          };
        }),
      ),
    }));

    const [latest] = await this.findAssessments(id);
    return {
      attemptSectionId: section.id,
      attemptId: section.attemptId,
      student: toUserDto(section.attempt.user),
      test: {
        id: section.attempt.test.id,
        title: section.attempt.test.title,
        examType: section.attempt.test.examType,
      },
      skill,
      submittedAt: section.submittedAt?.toISOString() ?? null,
      gradingStatus: section.gradingStatus!,
      revision: latest?.revision ?? 0,
      assessment: latest ?? null,
      expectedEntries: expectedEntriesOf(
        skill,
        questions.map(({ p, g }) => ({
          partId: p.id,
          questionType: g.questionType,
        })),
      ).map((e) => ({ ...e, criteria: [...e.criteria] })),
      parts: partDtos,
    };
  }

  async findAssessments(id: string): Promise<AssessmentDto[]> {
    const exists = await this.dataSource
      .getRepository(AttemptSection)
      .existsBy({ id });
    if (!exists) throw new NotFoundException('Attempt section not found');

    const rows = await this.dataSource
      .getRepository(Assessment)
      .createQueryBuilder('x')
      .innerJoinAndSelect('x.grader', 'grader')
      .where('x.attemptSectionId = :id', { id })
      .orderBy('x.revision', 'DESC')
      .getMany();
    return rows.map((a) => toAssessmentDto(a, a.grader));
  }

  private async loadUsers(ids: string[]): Promise<Map<string, User>> {
    if (!ids.length) return new Map();
    const users = await this.dataSource.getRepository(User).find({
      where: { id: In([...new Set(ids)]) },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    return new Map(users.map((u) => [u.id, u]));
  }
}

function toResponse(answer?: AttemptAnswer): GradingResponseDto | null {
  const text = (answer?.response as { text?: unknown } | null | undefined)
    ?.text;
  if (typeof text !== 'string') return null;
  return {
    text,
    wordCount: countWords(normalizeText(text)),
    audioUrl: null,
  };
}
