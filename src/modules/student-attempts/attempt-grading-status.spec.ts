import {
  AttemptSectionGradingStatus,
  AttemptStatus,
} from '../../types/attempt.type.js';
import { QuestionType, SkillType } from '../../types/test.type.js';
import {
  isTeacherGraded,
  isValidSpeakingSection,
  isValidWritingSection,
  resolveAttemptStatus,
  resolveTeacherSection,
} from './attempt-grading-status.js';

const task = (questionType: QuestionType, partId: number) => ({
  questionType,
  partId,
});
const T1 = QuestionType.IELTS_WRITING_TASK_1;
const T2 = QuestionType.IELTS_WRITING_TASK_2;

describe('isValidWritingSection', () => {
  it('accepts Task 1 and Task 2 in separate parts', () =>
    expect(isValidWritingSection([task(T1, 1), task(T2, 2)])).toBe(true));

  it.each([
    ['Task 2 only', [task(T2, 2)]],
    ['two Task 2', [task(T2, 1), task(T2, 2)]],
    ['one shared part', [task(T1, 1), task(T2, 1)]],
    [
      'a foreign type',
      [task(T1, 1), task(T2, 2), task(QuestionType.OPINION_ESSAY, 3)],
    ],
  ])('rejects %s', (_, questions) =>
    expect(isValidWritingSection(questions)).toBe(false),
  );
});

const { AUTO_GRADED, PENDING } = AttemptSectionGradingStatus;

describe('isTeacherGraded', () => {
  it.each([
    [SkillType.WRITING, true],
    [SkillType.SPEAKING, true],
    [SkillType.LISTENING, false],
    [SkillType.READING, false],
  ])('%s is %s', (skill, expected) =>
    expect(isTeacherGraded(skill)).toBe(expected),
  );
});

describe('resolveTeacherSection', () => {
  it('sends a section with any response to the teacher', () =>
    expect(resolveTeacherSection([null, { text: 'essay' }])).toEqual({
      gradingStatus: PENDING,
      scaledScore: null,
    }));

  it.each([[[]], [[null, undefined]], [[{ text: '   ' }, { text: '\n' }]]])(
    'scores a blank section 0: %j',
    (responses) =>
      expect(resolveTeacherSection(responses)).toEqual({
        gradingStatus: AUTO_GRADED,
        scaledScore: 0,
      }),
  );
});

describe('resolveAttemptStatus', () => {
  it('keeps EXPIRED even with work pending', () =>
    expect(resolveAttemptStatus(true, [{ gradingStatus: PENDING }])).toBe(
      AttemptStatus.EXPIRED,
    ));

  it('waits for the teacher', () =>
    expect(
      resolveAttemptStatus(false, [
        { gradingStatus: AUTO_GRADED },
        { gradingStatus: PENDING },
      ]),
    ).toBe(AttemptStatus.SUBMITTED));

  it('is GRADED when nothing is pending', () =>
    expect(resolveAttemptStatus(false, [{ gradingStatus: AUTO_GRADED }])).toBe(
      AttemptStatus.GRADED,
    ));
});

describe('isValidSpeakingSection', () => {
  it('requires Speaking questions only', () => {
    expect(
      isValidSpeakingSection([
        { questionType: QuestionType.IELTS_SPEAKING_PART_1 },
      ]),
    ).toBe(true);
    expect(isValidSpeakingSection([])).toBe(false);
    expect(
      isValidSpeakingSection([{ questionType: QuestionType.READ_ALOUD }]),
    ).toBe(false);
  });
});
