import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import type { IAttemptTree } from './attempt-tree.service.js';

import { AttemptAnswer } from '../../entities/attempt-answer.entity.js';
import { AttemptSection } from '../../entities/attempt-section.entity.js';
import { Attempt } from '../../entities/attempt.entity.js';
import { Question } from '../../entities/question.entity.js';
import { ScoreScale } from '../../entities/score-scale.entity.js';
import { overallScoreOf } from '../../shared/scoring/ielts-band.js';
import { AttemptSectionGradingStatus } from '../../types/attempt.type.js';
import { ExamType, SkillType } from '../../types/test.type.js';
import {
  type AttemptResponse,
  gradeAnswer,
  maxScoreOf,
} from './attempt-grader.js';
import {
  isTeacherGraded,
  resolveTeacherSection,
} from './attempt-grading-status.js';

@Injectable()
export class AttemptScoringService {
  async grade(
    manager: EntityManager,
    attempt: Attempt,
    tree: IAttemptTree,
    examType: ExamType,
  ): Promise<void> {
    const attemptSections = await manager.find(AttemptSection, {
      where: { attemptId: attempt.id },
    });
    const skillBySection = new Map(
      tree.sections.map((s) => [s.sectionId, s.skill]),
    );
    const isTeacherSection = (sectionId: number) => {
      const skill = skillBySection.get(sectionId);
      return !!skill && isTeacherGraded(skill);
    };
    const sectionIds = new Set(attemptSections.map((s) => s.sectionId));
    const questions = [...tree.questions.values()].filter((q) =>
      sectionIds.has(q.sectionId),
    );
    const autoQuestions = questions.filter(
      (q) => !isTeacherSection(q.sectionId),
    );

    const answers = autoQuestions.length
      ? await manager
          .createQueryBuilder(Question, 'q')
          .select(['q.id'])
          .addSelect('q.answer')
          .where('q.id IN (:...ids)', { ids: autoQuestions.map((q) => q.id) })
          .getMany()
      : [];
    const answerById = new Map(answers.map((q) => [q.id, q.answer]));

    const existing = await manager.find(AttemptAnswer, {
      where: { attemptId: attempt.id },
    });
    const existingById = new Map(existing.map((a) => [a.questionId, a]));

    const rawBySection = new Map<number, number>();
    const maxBySection = new Map<number, number>();
    const responsesBySection = new Map<number, (AttemptResponse | null)[]>();
    const rows = questions.map((q) => {
      const prev = existingById.get(q.id);
      if (isTeacherSection(q.sectionId)) {
        const responses = responsesBySection.get(q.sectionId) ?? [];
        responses.push((prev?.response as AttemptResponse | null) ?? null);
        responsesBySection.set(q.sectionId, responses);
        return {
          attemptId: attempt.id,
          questionId: q.id,
          response: (prev?.response ?? null) as AttemptAnswer['response'] &
            object,
          flagged: prev?.flagged ?? false,
          answeredAt: prev?.answeredAt ?? null,
          isCorrect: null,
          score: null,
        };
      }
      const grade = gradeAnswer(
        {
          answer: answerById.get(q.id) ?? {},
          numberFrom: q.numberFrom,
          numberTo: q.numberTo,
          wordLimit: q.wordLimit,
        },
        (prev?.response as AttemptResponse | null | undefined) ?? null,
      );
      rawBySection.set(
        q.sectionId,
        (rawBySection.get(q.sectionId) ?? 0) + grade.score,
      );
      maxBySection.set(
        q.sectionId,
        (maxBySection.get(q.sectionId) ?? 0) + maxScoreOf(q),
      );
      return {
        attemptId: attempt.id,
        questionId: q.id,
        response: (prev?.response ?? null) as AttemptAnswer['response'] &
          object,
        flagged: prev?.flagged ?? false,
        answeredAt: prev?.answeredAt ?? null,
        isCorrect: grade.isCorrect,
        score: grade.score,
      };
    });
    if (rows.length) {
      await manager.upsert(AttemptAnswer, rows, ['attemptId', 'questionId']);
    }

    const scaledBySkill = new Map<SkillType, number | null>();
    for (const section of attemptSections) {
      const skill = skillBySection.get(section.sectionId);
      if (skill && isTeacherGraded(skill)) {
        const resolved = resolveTeacherSection(
          responsesBySection.get(section.sectionId) ?? [],
        );
        section.rawScore = null;
        section.maxScore = null;
        section.gradingStatus = resolved.gradingStatus;
        section.scaledScore = resolved.scaledScore;
        scaledBySkill.set(skill, resolved.scaledScore);
        continue;
      }
      const raw = rawBySection.get(section.sectionId) ?? 0;
      const scaled = skill
        ? await this.lookupScale(manager, examType, skill, raw, tree.testId)
        : null;
      section.rawScore = raw;
      section.maxScore = maxBySection.get(section.sectionId) ?? 0;
      section.scaledScore = scaled;
      section.gradingStatus = AttemptSectionGradingStatus.AUTO_GRADED;
      if (skill) scaledBySkill.set(skill, scaled);
    }
    await manager.save(AttemptSection, attemptSections);

    attempt.overallScore = overallScoreOf({
      examType,
      mode: attempt.mode,
      scaledBySkill,
    });
    await manager.update(Attempt, attempt.id, {
      overallScore: attempt.overallScore,
    });
  }

  private async lookupScale(
    manager: EntityManager,
    examType: ExamType,
    skill: SkillType,
    rawScore: number,
    testId: number,
  ): Promise<number | null> {
    const scale = await manager
      .createQueryBuilder(ScoreScale, 's')
      .where('s.examType = :examType', { examType })
      .andWhere('s.skill = :skill', { skill })
      .andWhere('s.rawScore = :rawScore', { rawScore })
      .andWhere('(s.testId = :testId OR s.testId IS NULL)', { testId })
      .orderBy('s.testId', 'ASC', 'NULLS LAST')
      .limit(1)
      .getOne();
    return scale?.scaledScore ?? null;
  }
}
