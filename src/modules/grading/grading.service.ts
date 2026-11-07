import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Assessment } from '../../entities/assessment.entity.js';
import { AttemptSection } from '../../entities/attempt-section.entity.js';
import { Attempt } from '../../entities/attempt.entity.js';
import { QuestionGroup } from '../../entities/question-group.entity.js';
import { Question } from '../../entities/question.entity.js';
import { TestPart } from '../../entities/test-part.entity.js';
import { Test } from '../../entities/test.entity.js';
import { User } from '../../entities/user.entity.js';
import { overallScoreOf } from '../../shared/scoring/ielts-band.js';
import {
  AttemptErrorCode,
  AttemptSectionGradingStatus,
  AttemptStatus,
} from '../../types/attempt.type.js';
import { QuestionType, SkillType } from '../../types/test.type.js';
import { AssessmentDto } from './dto/grading-response.dto.js';
import { CreateAssessmentDto } from './dto/grading.dto.js';
import { computeAssessment, expectedEntriesOf } from './grading-entries.js';

const conflict = (code: AttemptErrorCode, message: string) =>
  new HttpException({ message, code }, HttpStatus.CONFLICT);

@Injectable()
export class GradingService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  createAssessment(
    id: string,
    dto: CreateAssessmentDto,
    graderId: string,
  ): Promise<AssessmentDto> {
    return this.dataSource.transaction(async (m) => {
      const target = await m.findOne(AttemptSection, {
        where: { id },
        select: { id: true, attemptId: true },
      });
      if (!target) throw new NotFoundException('Attempt section not found');

      const attempt = await m.findOneOrFail(Attempt, {
        where: { id: target.attemptId },
        lock: { mode: 'pessimistic_write' },
      });
      const sections = await m.find(AttemptSection, {
        where: { attemptId: attempt.id },
        relations: { testSection: true },
      });
      const section = sections.find((s) => s.id === id)!;
      if (
        section.gradingStatus !== AttemptSectionGradingStatus.PENDING &&
        section.gradingStatus !== AttemptSectionGradingStatus.GRADED
      ) {
        throw conflict(
          AttemptErrorCode.SECTION_NOT_GRADABLE,
          'This section is not waiting for a teacher',
        );
      }

      const { max } = (await m
        .createQueryBuilder(Assessment, 'a')
        .select('COALESCE(MAX(a.revision), 0)', 'max')
        .where('a.attemptSectionId = :id', { id })
        .getRawOne<{ max: number }>())!;
      const revision = Number(max);
      if (revision !== dto.expectedRevision) {
        throw conflict(
          AttemptErrorCode.ASSESSMENT_REVISION_CONFLICT,
          `This section is already at revision ${revision}`,
        );
      }

      const questions = await m
        .createQueryBuilder(Question, 'q')
        .innerJoin(QuestionGroup, 'g', 'g.id = q.groupId')
        .innerJoin(TestPart, 'p', 'p.id = g.partId')
        .where('p.sectionId = :sectionId', { sectionId: section.sectionId })
        .select('p.id', 'partId')
        .addSelect('g.questionType', 'questionType')
        .orderBy('p.order', 'ASC')
        .addOrderBy('g.order', 'ASC')
        .addOrderBy('q.order', 'ASC')
        .getRawMany<{
          partId: number;
          questionType: QuestionType;
        }>();
      const skill = section.testSection.skill;
      const { band, details } = computeAssessment(
        skill,
        expectedEntriesOf(skill, questions),
        dto.entries.map((e) => ({
          partId: e.partId ?? null,
          criteria: e.criteria,
          feedback: e.feedback,
        })),
      );

      const assessment = await m.save(Assessment, {
        attemptSectionId: id,
        revision: revision + 1,
        graderId,
        band,
        details,
      });
      await m.update(AttemptSection, id, {
        scaledScore: band,
        gradingStatus: AttemptSectionGradingStatus.GRADED,
      });
      section.scaledScore = band;
      section.gradingStatus = AttemptSectionGradingStatus.GRADED;

      const test = await m.findOneOrFail(Test, {
        where: { id: attempt.testId },
        select: { id: true, examType: true },
      });
      const scaledBySkill = new Map<SkillType, number | null | undefined>(
        sections.map((s) => [s.testSection.skill, s.scaledScore]),
      );
      await m.update(Attempt, attempt.id, {
        overallScore: overallScoreOf({
          examType: test.examType,
          mode: attempt.mode,
          scaledBySkill,
        }),
      });

      if (
        attempt.status === AttemptStatus.SUBMITTED &&
        !sections.some(
          (s) => s.gradingStatus === AttemptSectionGradingStatus.PENDING,
        )
      ) {
        await m.update(Attempt, attempt.id, { status: AttemptStatus.GRADED });
      }

      const grader = await m.findOneOrFail(User, {
        where: { id: graderId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      return {
        id: assessment.id,
        revision: assessment.revision,
        band,
        entries: details.entries,
        grader: {
          id: grader.id,
          email: grader.email ?? null,
          firstName: grader.firstName ?? null,
          lastName: grader.lastName ?? null,
        },
        createdAt: assessment.createdAt.toISOString(),
      };
    });
  }
}
