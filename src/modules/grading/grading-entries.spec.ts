import { BadRequestException } from '@nestjs/common';

import { QuestionType, SkillType } from '../../types/test.type.js';
import {
  computeAssessment,
  expectedEntriesOf,
  type IEntryInput,
} from './grading-entries.js';

const T1 = QuestionType.IELTS_WRITING_TASK_1,
  T2 = QuestionType.IELTS_WRITING_TASK_2;
const writing = expectedEntriesOf(SkillType.WRITING, [
  { partId: 11, questionType: T1 },
  { partId: 12, questionType: T2 },
]);
const speaking = expectedEntriesOf(SkillType.SPEAKING, [
  { partId: 21, questionType: QuestionType.IELTS_SPEAKING_PART_1 },
  { partId: 22, questionType: QuestionType.IELTS_SPEAKING_PART_2 },
]);
const task1 = { partId: 11, criteria: { TA: 7, CC: 7, LR: 7, GRA: 7 } };
const task2 = { partId: 12, criteria: { TR: 6, CC: 7, LR: 6, GRA: 7 } };

describe('grading entries', () => {
  it('derives criteria codes', () => {
    expect(writing).toEqual([
      { partId: 11, task: 1, criteria: ['TA', 'CC', 'LR', 'GRA'] },
      { partId: 12, task: 2, criteria: ['TR', 'CC', 'LR', 'GRA'] },
    ]);
    expect(speaking).toEqual([
      { partId: null, task: null, criteria: ['FC', 'LR', 'GRA', 'P'] },
    ]);
  });

  it('computes task and section bands for Writing', () => {
    const { band, details } = computeAssessment(SkillType.WRITING, writing, [
      task1,
      task2,
    ]);
    expect(band).toBe(6.5);
    expect(details.entries.map((e) => e.band)).toEqual([7, 6.5]);
    expect(details.entries[0].feedback).toBeNull();
  });

  it('computes the Speaking band', () => {
    const entry = {
      partId: null,
      criteria: { FC: 7, LR: 6, GRA: 6, P: 7 },
      feedback: 'Good',
    };
    expect(
      computeAssessment(SkillType.SPEAKING, speaking, [entry]),
    ).toMatchObject({
      band: 6.5,
      details: { entries: [{ band: 6.5, feedback: 'Good' }] },
    });
  });

  it.each([
    ['a missing task', [task1], 'part 12'],
    ['a duplicate task', [task1, task1], 'part 11'],
    ['an unknown part', [task1, { ...task2, partId: 99 }], 'part 99'],
    [
      'a missing criterion',
      [task1, { partId: 12, criteria: { TR: 6, CC: 7, LR: 6 } }],
      'part 12',
    ],
    [
      'Task 1 codes on Task 2',
      [task1, { partId: 12, criteria: task1.criteria }],
      'part 12',
    ],
    [
      'a score above 9',
      [task1, { partId: 12, criteria: { ...task2.criteria, TR: 9.5 } }],
      'part 12',
    ],
    [
      'a score below 0',
      [task1, { partId: 12, criteria: { ...task2.criteria, TR: -0.5 } }],
      'part 12',
    ],
    [
      'a score off the 0.5 step',
      [task1, { partId: 12, criteria: { ...task2.criteria, TR: 6.3 } }],
      'part 12',
    ],
    [
      'a non-number',
      [task1, { partId: 12, criteria: { ...task2.criteria, TR: '6' } }],
      'part 12',
    ],
  ])('rejects %s and names the entry', (_, entries, name) => {
    const input = entries as unknown as IEntryInput[];
    expect(() => computeAssessment(SkillType.WRITING, writing, input)).toThrow(
      BadRequestException,
    );
    expect(() => computeAssessment(SkillType.WRITING, writing, input)).toThrow(
      name,
    );
  });

  it('rejects a partId on Speaking', () => {
    const entry = { partId: 21, criteria: { FC: 7, LR: 6, GRA: 6, P: 7 } };
    expect(() =>
      computeAssessment(SkillType.SPEAKING, speaking, [entry]),
    ).toThrow(BadRequestException);
  });
});
