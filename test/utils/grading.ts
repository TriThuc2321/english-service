import { randomUUID } from 'node:crypto';

import type { TestApp } from './app.js';

import { QuestionGroup } from '../../src/entities/question-group.entity.js';
import { Question } from '../../src/entities/question.entity.js';
import { TestPart } from '../../src/entities/test-part.entity.js';
import { TestSection } from '../../src/entities/test-section.entity.js';
import { Test } from '../../src/entities/test.entity.js';
import {
  ExamType,
  QuestionType,
  SkillType,
  TestStatus,
} from '../../src/types/test.type.js';

export interface ISeededExam {
  test: Test;
  sections: Partial<Record<SkillType, TestSection>>;
  questions: Partial<Record<SkillType, Question[]>>;
}

const OPTIONS = { options: ['A', 'B'].map((key) => ({ key })) };

const PART_TYPES: Partial<Record<SkillType, QuestionType[]>> = {
  [SkillType.WRITING]: [
    QuestionType.IELTS_WRITING_TASK_1,
    QuestionType.IELTS_WRITING_TASK_2,
  ],
  [SkillType.SPEAKING]: [
    QuestionType.IELTS_SPEAKING_PART_1,
    QuestionType.IELTS_SPEAKING_PART_2,
    QuestionType.IELTS_SPEAKING_PART_3,
  ],
};

export async function seedExam(
  { dataSource }: TestApp,
  skills: SkillType[],
  overrides: Partial<Test> = {},
): Promise<ISeededExam> {
  const test = await dataSource.getRepository(Test).save({
    examType: ExamType.IELTS_ACADEMIC,
    title: 'Grading test',
    slug: `grading-test-${randomUUID()}`,
    status: TestStatus.PUBLISHED,
    publishedAt: new Date(),
    ...overrides,
  });

  const sections: ISeededExam['sections'] = {};
  const questions: ISeededExam['questions'] = {};

  for (const [order, skill] of skills.entries()) {
    const section = await dataSource.getRepository(TestSection).save({
      testId: test.id,
      skill,
      order,
      durationMinutes: 30,
    });
    sections[skill] = section;
    questions[skill] = [];

    const types = PART_TYPES[skill] ?? [QuestionType.MULTIPLE_CHOICE];
    for (const [i, questionType] of types.entries()) {
      const part = await dataSource
        .getRepository(TestPart)
        .save({ sectionId: section.id, order: i });
      const group = await dataSource
        .getRepository(QuestionGroup)
        .save({ partId: part.id, order: 0, questionType });
      const isAuto = !PART_TYPES[skill];
      questions[skill].push(
        await dataSource.getRepository(Question).save({
          groupId: group.id,
          order: 0,
          numberFrom: i + 1,
          numberTo: i + 1,
          content: isAuto ? OPTIONS : undefined,
          answer: isAuto
            ? { key: 'A' }
            : { sample: 'Sample', rubric: { TA: 'Band 7' } },
        }),
      );
    }
  }

  return { test, sections, questions };
}

export const backdateOpenSections = (testApp: TestApp, attemptId: string) =>
  testApp.dataSource.query(
    `UPDATE attempt_sections
        SET started_at = now() - interval '3 hours',
            deadline_at = now() - interval '150 minutes'
      WHERE attempt_id = $1 AND status = 'IN_PROGRESS'`,
    [attemptId],
  );
