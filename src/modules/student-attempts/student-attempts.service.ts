import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';

import type { IAttemptTree, ITreeSection } from './attempt-tree.service.js';
import type {
  AttemptDto,
  AttemptListItemDto,
  SaveAnswersResultDto,
} from './dto/student-attempt-response.dto.js';

import { AttemptAnswer } from '../../entities/attempt-answer.entity.js';
import { AttemptSection } from '../../entities/attempt-section.entity.js';
import { Attempt } from '../../entities/attempt.entity.js';
import { Test } from '../../entities/test.entity.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import {
  AttemptErrorCode,
  AttemptMode,
  AttemptSectionStatus,
  AttemptStatus,
} from '../../types/attempt.type.js';
import { ExamType, TestStatus } from '../../types/test.type.js';
import { parseResponse } from './attempt-response.js';
import { AttemptScoringService } from './attempt-scoring.service.js';
import {
  closeAll,
  isFinished,
  type ITimeline,
  openTimeline,
  reconcile,
  submitSection as closeSection,
} from './attempt-timeline.js';
import { AttemptTreeService } from './attempt-tree.service.js';
import { toAttemptDto, toListItemDto } from './attempt.mapper.js';
import {
  ListAttemptsDto,
  SaveAnswersDto,
  StartAttemptDto,
} from './dto/student-attempts.dto.js';

const IN_PROGRESS_INDEX = 'uq_attempts_user_id_test_id_in_progress';
const CLOSED = Symbol('closed');

interface IAttemptContext {
  m: EntityManager;
  now: Date;
  attempt: Attempt;
  test: Test;
  tree: IAttemptTree;
  sectionMeta: ReadonlyMap<number, ITreeSection>;
  sections: AttemptSection[];
  timeline: ITimeline;
}

const fail = (status: HttpStatus, code: AttemptErrorCode, message: string) =>
  new HttpException({ message, code }, status);

const sectionMetaOf = (tree: IAttemptTree) =>
  new Map(tree.sections.map((s) => [s.sectionId, s]));

@Injectable()
export class StudentAttemptsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Attempt)
    private readonly attemptRepository: Repository<Attempt>,
    private readonly treeService: AttemptTreeService,
    private readonly scoringService: AttemptScoringService,
  ) {}

  async start(userId: string, dto: StartAttemptDto): Promise<AttemptDto> {
    const started = await this.tryStart(userId, dto);
    if (started) return started;

    const existingId = await this.findInProgressId(userId, dto.testId);
    // The open attempt may be past its deadline: reconciling it closes it and frees the slot for a retake
    const stillOpen =
      existingId !== null &&
      (await this.withAttempt(
        userId,
        existingId,
        new Date(),
        false,
        async (ctx) => ctx.attempt.status === AttemptStatus.IN_PROGRESS,
      ));
    const retried = stillOpen ? null : await this.tryStart(userId, dto);
    if (retried) return retried;

    throw new HttpException(
      {
        message: 'An attempt is already in progress for this test',
        code: AttemptErrorCode.ATTEMPT_IN_PROGRESS,
        attemptId: stillOpen
          ? existingId
          : ((await this.findInProgressId(userId, dto.testId)) ?? undefined),
      },
      HttpStatus.CONFLICT,
    );
  }

  private async tryStart(
    userId: string,
    dto: StartAttemptDto,
  ): Promise<AttemptDto | null> {
    try {
      return await this.startOnce(userId, dto);
    } catch (error) {
      if (this.isInProgressConflict(error)) return null;
      throw error;
    }
  }

  private async startOnce(
    userId: string,
    dto: StartAttemptDto,
  ): Promise<AttemptDto> {
    const now = new Date();
    // Fetched outside the transaction so it never sees an uncommitted lockedAt (and caches nothing for a lock that may roll back)
    const tree = await this.treeService.get(dto.testId).catch((error) => {
      throw error instanceof NotFoundException
        ? this.testNotFound(dto.testId)
        : error;
    });

    return this.dataSource.transaction(async (m) => {
      const test = await m.findOne(Test, {
        where: { id: dto.testId, status: TestStatus.PUBLISHED },
      });
      if (!test) {
        throw this.testNotFound(dto.testId);
      }

      await m
        .createQueryBuilder()
        .update(Test)
        .set({ lockedAt: now })
        .where('id = :id AND locked_at IS NULL', { id: test.id })
        .execute();

      const chosen = this.pickSections(tree, dto);
      const timeline = openTimeline(
        {
          examType: test.examType,
          mode: dto.mode,
          testDurationMinutes: test.durationMinutes ?? null,
          sections: chosen,
        },
        now,
      );

      const attempt = await m.save(
        m.create(Attempt, {
          userId,
          testId: test.id,
          mode: dto.mode,
          status: AttemptStatus.IN_PROGRESS,
          startedAt: now,
          deadlineAt: timeline.deadlineAt,
          attemptSections: timeline.sections.map((s) =>
            m.create(AttemptSection, {
              sectionId: s.sectionId,
              status: s.status,
              startedAt: s.startedAt,
              deadlineAt: s.deadlineAt,
              submittedAt: s.submittedAt,
            }),
          ),
        }),
      );

      return toAttemptDto({
        attempt,
        test,
        sections: attempt.attemptSections,
        sectionMeta: sectionMetaOf(tree),
        answers: [],
        now,
      });
    });
  }

  private testNotFound(testId: number) {
    return fail(
      HttpStatus.NOT_FOUND,
      AttemptErrorCode.TEST_NOT_FOUND,
      `Test ${testId} not found`,
    );
  }

  private async findInProgressId(
    userId: string,
    testId: number,
  ): Promise<string | null> {
    const existing = await this.attemptRepository.findOne({
      where: { userId, testId, status: AttemptStatus.IN_PROGRESS },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  async findAll(
    userId: string,
    { page, take, testId, status }: ListAttemptsDto,
  ): Promise<PaginationDto<AttemptListItemDto>> {
    const qb = this.attemptRepository
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
      .where('a.userId = :userId', { userId });

    if (testId) qb.andWhere('a.testId = :testId', { testId });
    if (status) qb.andWhere('a.status = :status', { status });

    const [attempts, totalCount] = await qb
      .orderBy('a.startedAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip((page - 1) * take)
      .take(take)
      .getManyAndCount();

    return new PaginationDto(
      attempts.map(toListItemDto),
      new PageMetaDto({ page, take, totalCount }),
    );
  }

  findOne(userId: string, id: string): Promise<AttemptDto> {
    return this.withAttempt(userId, id, new Date(), false, (ctx) =>
      this.toDto(ctx),
    );
  }

  async expireIfOverdue(userId: string, id: string): Promise<void> {
    await this.withAttempt(userId, id, new Date(), false, async () => {});
  }

  saveAnswers(
    userId: string,
    id: string,
    dto: SaveAnswersDto,
  ): Promise<SaveAnswersResultDto> {
    const now = new Date();
    return this.withAttempt(userId, id, now, true, async (ctx) => {
      const items = new Map(dto.answers.map((a) => [a.questionId, a]));
      const statusBySection = new Map(
        ctx.sections.map((s) => [s.sectionId, s.status]),
      );

      const parsed = [...items.values()].map((item) => {
        const question = ctx.tree.questions.get(item.questionId);
        const status = question && statusBySection.get(question.sectionId);
        if (!question || !status) {
          throw new BadRequestException(
            `Question ${item.questionId} is not part of this attempt`,
          );
        }
        if (status !== AttemptSectionStatus.IN_PROGRESS) {
          throw fail(
            HttpStatus.CONFLICT,
            AttemptErrorCode.SECTION_NOT_OPEN,
            `Question ${question.numberFrom} is in a section that is not open`,
          );
        }
        return { item, response: parseResponse(question, item.response) };
      });

      const stored = await ctx.m.find(AttemptAnswer, {
        where: { attemptId: ctx.attempt.id, questionId: In([...items.keys()]) },
        select: { questionId: true, flagged: true },
      });
      const storedFlag = new Map(stored.map((a) => [a.questionId, a.flagged]));

      await ctx.m.upsert(
        AttemptAnswer,
        parsed.map(({ item, response }) => ({
          attemptId: ctx.attempt.id,
          questionId: item.questionId,
          response: response as AttemptAnswer['response'] & object,
          flagged: item.flagged ?? storedFlag.get(item.questionId) ?? false,
          answeredAt: response === null ? null : now,
        })),
        ['attemptId', 'questionId'],
      );

      return { savedAt: now.toISOString(), serverNow: now.toISOString() };
    });
  }

  submitSection(
    userId: string,
    id: string,
    sectionId: number,
  ): Promise<AttemptDto> {
    const now = new Date();
    return this.withAttempt(userId, id, now, true, async (ctx) => {
      const section = ctx.sections.find((s) => s.sectionId === sectionId);
      if (section?.status !== AttemptSectionStatus.IN_PROGRESS) {
        throw fail(
          HttpStatus.CONFLICT,
          AttemptErrorCode.SECTION_NOT_OPEN,
          `Section ${sectionId} is not open`,
        );
      }
      await this.applyTimeline(
        ctx,
        closeSection(ctx.test.examType, ctx.timeline, sectionId, now),
      );
      if (isFinished(ctx.timeline)) {
        await this.finish(ctx, AttemptStatus.GRADED, now);
      }
      return this.toDto(ctx);
    });
  }

  submit(userId: string, id: string): Promise<AttemptDto> {
    const now = new Date();
    return this.withAttempt(userId, id, now, true, async (ctx) => {
      await this.applyTimeline(ctx, closeAll(ctx.timeline, now));
      await this.finish(ctx, AttemptStatus.GRADED, now);
      return this.toDto(ctx);
    });
  }

  private async withAttempt<T>(
    userId: string,
    id: string,
    now: Date,
    write: boolean,
    action: (ctx: IAttemptContext) => Promise<T>,
  ): Promise<T> {
    const result = await this.dataSource.transaction(async (m) => {
      const ctx = await this.lock(m, userId, id, now);
      if (write && ctx.attempt.status !== AttemptStatus.IN_PROGRESS) {
        return CLOSED;
      }
      return action(ctx);
    });
    // Thrown after commit so a just-noticed expiry keeps its grading
    if (result === CLOSED) {
      throw fail(
        HttpStatus.CONFLICT,
        AttemptErrorCode.ATTEMPT_CLOSED,
        'The attempt is already closed',
      );
    }
    return result;
  }

  private async lock(
    m: EntityManager,
    userId: string,
    id: string,
    now: Date,
  ): Promise<IAttemptContext> {
    // No relations: Postgres refuses FOR UPDATE on the nullable side of an outer join
    const attempt = await m.findOne(Attempt, {
      where: { id, userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!attempt) {
      throw fail(
        HttpStatus.NOT_FOUND,
        AttemptErrorCode.ATTEMPT_NOT_FOUND,
        `Attempt ${id} not found`,
      );
    }
    const test = await m.findOneOrFail(Test, {
      where: { id: attempt.testId },
      select: { id: true, slug: true, examType: true },
    });
    const tree = await this.treeService.get(attempt.testId, m);
    const sectionMeta = sectionMetaOf(tree);
    const sections = await this.loadSections(m, attempt.id, sectionMeta);

    const ctx: IAttemptContext = {
      m,
      now,
      attempt,
      test,
      tree,
      sectionMeta,
      sections,
      timeline: {
        deadlineAt: attempt.deadlineAt ?? null,
        sections: sections.map((s) => ({
          sectionId: s.sectionId,
          order: sectionMeta.get(s.sectionId)?.order ?? 0,
          durationMinutes:
            sectionMeta.get(s.sectionId)?.durationMinutes ?? null,
          status: s.status,
          startedAt: s.startedAt ?? null,
          deadlineAt: s.deadlineAt ?? null,
          submittedAt: s.submittedAt ?? null,
        })),
      },
    };

    if (attempt.status === AttemptStatus.IN_PROGRESS) {
      const { timeline, expired } = reconcile(test.examType, ctx.timeline, now);
      if (timeline !== ctx.timeline) await this.applyTimeline(ctx, timeline);
      if (expired) {
        await this.finish(ctx, AttemptStatus.EXPIRED, this.expiredAt(ctx));
      }
    }
    return ctx;
  }

  private async loadSections(
    m: EntityManager,
    attemptId: string,
    sectionMeta: ReadonlyMap<number, ITreeSection>,
  ) {
    const sections = await m.find(AttemptSection, { where: { attemptId } });
    const orderOf = (s: AttemptSection) =>
      sectionMeta.get(s.sectionId)?.order ?? 0;
    return sections.sort((a, b) => orderOf(a) - orderOf(b));
  }

  private async applyTimeline(ctx: IAttemptContext, timeline: ITimeline) {
    const bySection = new Map(timeline.sections.map((s) => [s.sectionId, s]));
    for (const section of ctx.sections) {
      const next = bySection.get(section.sectionId);
      if (!next) continue;
      section.status = next.status;
      section.startedAt = next.startedAt;
      section.deadlineAt = next.deadlineAt;
      section.submittedAt = next.submittedAt;
    }
    await ctx.m.save(AttemptSection, ctx.sections);
    ctx.timeline = timeline;
  }

  private expiredAt({ test, attempt, timeline }: IAttemptContext): Date {
    if (test.examType === ExamType.TOEIC_LR && attempt.deadlineAt) {
      return attempt.deadlineAt;
    }
    const times = timeline.sections.map((s) => s.submittedAt?.getTime() ?? 0);
    return new Date(Math.max(...times));
  }

  private async finish(
    ctx: IAttemptContext,
    status: AttemptStatus,
    submittedAt: Date,
  ) {
    await this.scoringService.grade(
      ctx.m,
      ctx.attempt,
      ctx.tree,
      ctx.test.examType,
    );
    ctx.attempt.status = status;
    ctx.attempt.submittedAt = submittedAt;
    await ctx.m.update(Attempt, ctx.attempt.id, { status, submittedAt });
    ctx.sections = await this.loadSections(
      ctx.m,
      ctx.attempt.id,
      ctx.sectionMeta,
    );
  }

  private async toDto(ctx: IAttemptContext): Promise<AttemptDto> {
    const answers = await ctx.m.find(AttemptAnswer, {
      where: { attemptId: ctx.attempt.id },
      select: {
        questionId: true,
        response: true,
        flagged: true,
        answeredAt: true,
      },
      order: { questionId: 'ASC' },
    });
    return toAttemptDto({ ...ctx, answers });
  }

  private pickSections(tree: IAttemptTree, dto: StartAttemptDto) {
    let chosen = tree.sections;
    if (dto.mode === AttemptMode.SECTION) {
      const ids = new Set(dto.sectionIds);
      chosen = tree.sections.filter((s) => ids.has(s.sectionId));
      if (chosen.length !== ids.size) {
        throw new BadRequestException(
          'sectionIds must be listening or reading sections of this test',
        );
      }
    }
    if (!chosen.length) {
      throw new BadRequestException(
        'The test has no listening or reading section',
      );
    }
    return chosen;
  }

  private isInProgressConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };
    return (
      driverError.code === '23505' &&
      driverError.constraint === IN_PROGRESS_INDEX
    );
  }
}
