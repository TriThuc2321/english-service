import type { ITreeSection } from './attempt-tree.service.js';
import type {
  AttemptAnswerStateDto,
  AttemptDto,
  AttemptListItemDto,
  AttemptSectionDto,
} from './dto/student-attempt-response.dto.js';

import { AttemptAnswer } from '../../entities/attempt-answer.entity.js';
import { AttemptSection } from '../../entities/attempt-section.entity.js';
import { Attempt } from '../../entities/attempt.entity.js';
import { Test } from '../../entities/test.entity.js';

type SectionMeta = Pick<ITreeSection, 'skill' | 'order'>;

const iso = (date?: Date | null) => (date ? date.toISOString() : null);

export const toSectionDto = (
  s: AttemptSection,
  { skill, order }: SectionMeta,
): AttemptSectionDto => ({
  id: s.id,
  sectionId: s.sectionId,
  skill,
  order,
  status: s.status,
  startedAt: iso(s.startedAt),
  deadlineAt: iso(s.deadlineAt),
  submittedAt: iso(s.submittedAt),
  rawScore: s.rawScore ?? null,
  maxScore: s.maxScore ?? null,
  scaledScore: s.scaledScore ?? null,
});

const toBase = (
  attempt: Attempt,
  testSlug: string,
  sections: AttemptSectionDto[],
) => ({
  id: attempt.id,
  testId: attempt.testId,
  testSlug,
  mode: attempt.mode,
  status: attempt.status,
  startedAt: attempt.startedAt.toISOString(),
  deadlineAt: iso(attempt.deadlineAt),
  submittedAt: iso(attempt.submittedAt),
  overallScore: attempt.overallScore ?? null,
  sections: sections.sort((a, b) => a.order - b.order),
});

export const toAnswerDto = (a: AttemptAnswer): AttemptAnswerStateDto => ({
  questionId: a.questionId,
  response: a.response ?? null,
  flagged: a.flagged,
  answeredAt: iso(a.answeredAt),
});

export const toAttemptDto = (input: {
  attempt: Attempt;
  test: Pick<Test, 'slug'>;
  sections: AttemptSection[];
  sectionMeta: ReadonlyMap<number, SectionMeta>;
  answers: AttemptAnswer[];
  now: Date;
}): AttemptDto => ({
  ...toBase(
    input.attempt,
    input.test.slug,
    input.sections.flatMap((s) => {
      const meta = input.sectionMeta.get(s.sectionId);
      return meta ? [toSectionDto(s, meta)] : [];
    }),
  ),
  serverNow: input.now.toISOString(),
  answers: input.answers.map(toAnswerDto),
});

export const toListItemDto = (attempt: Attempt): AttemptListItemDto => ({
  ...toBase(
    attempt,
    attempt.test.slug,
    attempt.attemptSections.map((s) => toSectionDto(s, s.testSection)),
  ),
  test: {
    id: attempt.test.id,
    slug: attempt.test.slug,
    title: attempt.test.title,
    examType: attempt.test.examType,
  },
});
