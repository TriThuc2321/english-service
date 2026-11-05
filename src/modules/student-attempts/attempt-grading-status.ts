import type { AttemptSection } from '../../entities/attempt-section.entity.js';
import type { AttemptResponse } from './attempt-grader.js';
import type { ITreeQuestion } from './attempt-tree.service.js';

import {
  AttemptSectionGradingStatus,
  AttemptStatus,
} from '../../types/attempt.type.js';
import { QuestionType, SkillType } from '../../types/test.type.js';
import { isBlankResponse } from './attempt-grader.js';

export const isTeacherGraded = (skill: SkillType): boolean =>
  skill === SkillType.WRITING || skill === SkillType.SPEAKING;

export function resolveTeacherSection(
  responses: ReadonlyArray<AttemptResponse | null | undefined>,
): {
  gradingStatus: AttemptSectionGradingStatus;
  scaledScore: number | null;
} {
  return responses.every(isBlankResponse)
    ? {
        gradingStatus: AttemptSectionGradingStatus.AUTO_GRADED,
        scaledScore: 0,
      }
    : {
        gradingStatus: AttemptSectionGradingStatus.PENDING,
        scaledScore: null,
      };
}

export function resolveAttemptStatus(
  expired: boolean,
  sections: ReadonlyArray<Pick<AttemptSection, 'gradingStatus'>>,
): AttemptStatus {
  if (expired) return AttemptStatus.EXPIRED;
  return sections.some(
    (s) => s.gradingStatus === AttemptSectionGradingStatus.PENDING,
  )
    ? AttemptStatus.SUBMITTED
    : AttemptStatus.GRADED;
}

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
