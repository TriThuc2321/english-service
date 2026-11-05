import { QuestionType } from '../../types/test.type.js';
import { isValidWritingSection } from './attempt-grading-status.js';

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
