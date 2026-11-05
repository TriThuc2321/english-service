import type { ITreeQuestion } from './attempt-tree.service.js';

import { QuestionType } from '../../types/test.type.js';

export function isValidWritingSection(
  questions: readonly Pick<ITreeQuestion, 'partId' | 'questionType'>[],
): boolean {
  if (questions.length !== 2) return false;
  const task1 = questions.find(
    (q) => q.questionType === QuestionType.IELTS_WRITING_TASK_1,
  );
  const task2 = questions.find(
    (q) => q.questionType === QuestionType.IELTS_WRITING_TASK_2,
  );
  return !!task1 && !!task2 && task1.partId !== task2.partId;
}
