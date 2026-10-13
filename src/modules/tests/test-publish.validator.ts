import { BadRequestException } from '@nestjs/common';

import type { Passage } from '../../entities/passage.entity.js';
import type { QuestionGroup } from '../../entities/question-group.entity.js';
import type { Test } from '../../entities/test.entity.js';

import { PassageStatus } from '../../entities/passage.entity.js';
import { ExamType, QuestionType, SkillType } from '../../types/test.type.js';
import {
  assertAnswerInOptions,
  assertValidAnswer,
} from '../questions/question-answer.js';
import {
  assertValidGroupContent,
  assertValidQuestionContent,
  groupPlaceholders,
} from '../questions/question-content.js';

// Question numbers each section must cover exactly; other sections only need
// to be gap-free
const SECTION_NUMBERING: Partial<
  Record<ExamType, Partial<Record<SkillType, readonly [number, number]>>>
> = {
  [ExamType.IELTS_ACADEMIC]: {
    [SkillType.LISTENING]: [1, 40],
    [SkillType.READING]: [1, 40],
  },
  [ExamType.IELTS_GENERAL]: {
    [SkillType.LISTENING]: [1, 40],
    [SkillType.READING]: [1, 40],
  },
  [ExamType.TOEIC_LR]: {
    [SkillType.LISTENING]: [1, 100],
    [SkillType.READING]: [101, 200],
  },
  [ExamType.TOEIC_SW]: {
    [SkillType.SPEAKING]: [1, 11],
    [SkillType.WRITING]: [1, 8],
  },
};

const IELTS = new Set([ExamType.IELTS_ACADEMIC, ExamType.IELTS_GENERAL]);

const NEEDS_IMAGE = new Set([
  QuestionType.DIAGRAM_LABELLING,
  QuestionType.MAP_LABELLING,
  QuestionType.PLAN_LABELLING,
]);

const WORD_BANK_TYPES = new Set([
  QuestionType.SENTENCE_COMPLETION,
  QuestionType.SUMMARY_COMPLETION,
  QuestionType.NOTE_COMPLETION,
]);

export type PublishCheckedTest = Pick<
  Test,
  'examType' | 'durationMinutes' | 'testSections'
>;

// "1-4, 7, 9-12"
function formatNumbers(numbers: number[]) {
  const ranges: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const start = numbers[i];
    while (numbers[i + 1] === numbers[i] + 1) i++;
    ranges.push(start === numbers[i] ? `${start}` : `${start}-${numbers[i]}`);
  }
  return ranges.join(', ');
}

function groupLabel(group: QuestionGroup) {
  const numbers = group.questions.flatMap((q) => [q.numberFrom, q.numberTo]);
  if (!numbers.length) return `group #${group.id} (${group.questionType})`;

  const from = Math.min(...numbers);
  const to = Math.max(...numbers);
  return `questions ${from === to ? from : `${from}-${to}`} (${group.questionType})`;
}

function checkNumbering(
  label: string,
  numbers: number[],
  expected: readonly [number, number] | undefined,
  issues: string[],
) {
  if (!numbers.length) return;

  const sorted = [...numbers].sort((a, b) => a - b);
  const unique = [...new Set(sorted)];
  const duplicates = unique.filter(
    (n) => sorted.indexOf(n) !== sorted.lastIndexOf(n),
  );
  if (duplicates.length) {
    issues.push(
      `${label}: question number(s) used more than once: ${formatNumbers(duplicates)}`,
    );
  }

  const [first, last] = expected ?? [unique[0], unique[unique.length - 1]];
  const present = new Set(unique);
  const missing: number[] = [];
  for (let n = first; n <= last; n++) {
    if (!present.has(n)) missing.push(n);
  }
  if (missing.length) {
    issues.push(
      `${label}: missing question number(s) ${formatNumbers(missing)}`,
    );
  }

  const outside = unique.filter((n) => n < first || n > last);
  if (outside.length) {
    issues.push(
      `${label}: question number(s) ${formatNumbers(outside)} outside ${first}-${last}`,
    );
  }
}

// Re-runs the save-time checks so rows saved before a rule existed are caught
function collectSaveErrors(label: string, check: () => void, issues: string[]) {
  try {
    check();
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    issues.push(`${label}: ${error.message}`);
  }
}

function checkGroup(
  group: QuestionGroup,
  label: string,
  passageRequired: boolean,
  passageStatus: Map<number, PassageStatus>,
  issues: string[],
) {
  const { questionType: type, content } = group;

  if (!group.questions.length) {
    issues.push(`${label}: has no questions`);
  }

  if (passageRequired && !group.groupPassages.length) {
    issues.push(`${label}: needs a linked passage`);
  }
  for (const { passageId } of group.groupPassages) {
    const status = passageStatus.get(passageId);
    if (!status || status === PassageStatus.DELETED) {
      issues.push(`${label}: passage #${passageId} was deleted`);
    }
  }

  if (NEEDS_IMAGE.has(type) && group.imageMediaId == null) {
    issues.push(`${label}: needs an image (imageMediaId)`);
  }

  const issueCount = issues.length;
  collectSaveErrors(
    label,
    () => assertValidGroupContent(type, content),
    issues,
  );
  const contentValid = issues.length === issueCount;
  for (const q of group.questions) {
    collectSaveErrors(
      label,
      () => {
        assertValidAnswer(type, q);
        assertValidQuestionContent(type, q.content, q.numberFrom);
        assertAnswerInOptions(type, q, content);
      },
      issues,
    );
  }

  const placeholders = contentValid ? groupPlaceholders(type, content) : null;
  if (placeholders) {
    const numbers = group.questions.map((q) => q.numberFrom);
    const missing = numbers.filter((n) => !placeholders.includes(n));
    const orphan = placeholders.filter((n) => !numbers.includes(n));
    if (missing.length) {
      issues.push(
        `${label}: no {{n}} placeholder for question(s) ${formatNumbers(missing.sort((a, b) => a - b))}`,
      );
    }
    if (orphan.length) {
      issues.push(
        `${label}: placeholder(s) ${orphan.map((n) => `{{${n}}}`).join(', ')} have no question`,
      );
    }
  }

  // With a word bank the student picks a key, so free-text answers can't match
  if (WORD_BANK_TYPES.has(type) && Array.isArray(content?.options)) {
    const freeText = group.questions
      .filter((q) => 'accepted' in q.answer)
      .map((q) => q.numberFrom);
    if (freeText.length) {
      issues.push(
        `${label}: the group has a word bank, so question(s) ${formatNumbers(freeText)} need a {"key"} answer`,
      );
    }
  }
}

// Expects the full tree from TestsService.findTree (answers included) and the
// passages it links to
export function collectPublishIssues(
  test: PublishCheckedTest,
  passages: Pick<Passage, 'id' | 'status'>[],
) {
  const issues: string[] = [];
  const isIelts = IELTS.has(test.examType);
  const passageStatus = new Map(passages.map((p) => [p.id, p.status]));

  if (test.examType === ExamType.TOEIC_LR && test.durationMinutes == null) {
    issues.push(`${test.examType} tests need durationMinutes`);
  }
  if (!test.testSections.length) {
    issues.push('Test has no sections');
  }

  for (const section of test.testSections) {
    const sectionLabel = `${section.skill} section`;
    if (isIelts && section.durationMinutes == null) {
      issues.push(`${sectionLabel}: needs durationMinutes`);
    }
    if (!section.testParts.length) {
      issues.push(`${sectionLabel}: has no parts`);
    }

    const numbers: number[] = [];
    for (const part of section.testParts) {
      const partLabel = `${sectionLabel} › ${part.title ?? `part #${part.id}`}`;
      const ieltsReading = isIelts && section.skill === SkillType.READING;

      if (
        isIelts &&
        section.skill === SkillType.LISTENING &&
        part.audioMediaId == null
      ) {
        issues.push(`${partLabel}: needs audio (audioMediaId)`);
      }
      if (!part.questionGroups.length) {
        issues.push(`${partLabel}: has no question groups`);
      }

      // An IELTS Reading part is one passage, so its groups must agree on it
      const passageSets = new Set(
        part.questionGroups.map((g) =>
          g.groupPassages
            .map((gp) => gp.passageId)
            .sort((a, b) => a - b)
            .join(','),
        ),
      );
      if (ieltsReading && passageSets.size > 1) {
        issues.push(
          `${partLabel}: question groups link different passages; link the same passage to every group`,
        );
      }

      for (const group of part.questionGroups) {
        checkGroup(
          group,
          `${partLabel} › ${groupLabel(group)}`,
          ieltsReading || group.questionType === QuestionType.TEXT_COMPLETION,
          passageStatus,
          issues,
        );
        for (const q of group.questions) {
          for (let n = q.numberFrom; n <= q.numberTo; n++) numbers.push(n);
        }
      }
    }

    checkNumbering(
      sectionLabel,
      numbers,
      SECTION_NUMBERING[test.examType]?.[section.skill],
      issues,
    );
  }

  return issues;
}
