import { HttpException } from '@nestjs/common';

import type {
  IImportGroup,
  IImportIssue,
  IImportPassage,
  IImportQuestion,
  ITestImport,
} from './test-import.type.js';

import { MarkedBy } from '../../entities/passage.entity.js';
import { EXAM_SKILLS, QuestionType } from '../../types/test.type.js';
import { normalizeText } from '../questions/answer-text.js';
import {
  assertAnswerFitsGroup,
  assertValidAnswer,
} from '../questions/question-answer.js';
import {
  assertValidGroupContent,
  assertValidQuestionContent,
} from '../questions/question-content.js';

const PROMPTED_TYPES = new Set([
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE_MULTI,
  QuestionType.TRUE_FALSE_NOT_GIVEN,
  QuestionType.YES_NO_NOT_GIVEN,
  QuestionType.MATCHING_HEADINGS,
  QuestionType.MATCHING_INFORMATION,
  QuestionType.MATCHING_FEATURES,
  QuestionType.MATCHING_SENTENCE_ENDINGS,
  QuestionType.CLASSIFICATION,
  QuestionType.SHORT_ANSWER,
]);

const PLACEHOLDER = /\{\{\s*(\d+)\s*\}\}/g;

// Inner punctuation and hyphens are dropped so "deep-level," matches "deep level";
// apostrophes survive only inside words, as ‘…’ quotes normalize to them too
const tokens = (text: string) =>
  normalizeText(text)
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .replace(/(^|\s)'+|'+(?=\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const contains = (haystack: string, needle: string) =>
  ` ${tokens(haystack)} `.includes(` ${tokens(needle)} `);

const letterOf = (index: number) => String.fromCharCode(65 + index);

function placeholdersOf(content: IImportGroup['content']): number[] | null {
  const table = content?.table as { rows?: unknown } | undefined;
  const texts = [
    typeof content?.template === 'string' ? content.template : null,
    ...(Array.isArray(table?.rows) ? (table.rows as unknown[]).flat() : []),
  ].filter((t): t is string => typeof t === 'string');
  if (!texts.length) {
    return null;
  }
  return texts.flatMap((t) => [...t.matchAll(PLACEHOLDER)].map((m) => +m[1]));
}

export function validateTestImport(doc: ITestImport): IImportIssue[] {
  const issues: IImportIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ severity: 'error', path, message });
  const warn = (path: string, message: string) =>
    issues.push({ severity: 'warning', path, message });
  const attempt = (path: string, check: () => void) => {
    try {
      check();
    } catch (e) {
      if (!(e instanceof HttpException)) throw e;
      error(path, e.message);
    }
  };

  if (!doc.title?.trim()) {
    error('title', 'title is required');
  }
  if (!doc.sections?.length) {
    error('sections', 'a test needs at least one section');
    return issues;
  }

  const allowedSkills = EXAM_SKILLS[doc.examType];
  if (!allowedSkills) {
    error('examType', `unknown exam type ${String(doc.examType)}`);
  }

  doc.sections.forEach((section, s) => {
    const sectionPath = `sections[${s}]`;
    if (allowedSkills && !allowedSkills.includes(section.skill)) {
      error(sectionPath, `${doc.examType} has no ${section.skill} section`);
    }
    if (!section.parts?.length) {
      error(sectionPath, 'a section needs at least one part');
      return;
    }

    let next = 1;
    section.parts.forEach((part, p) => {
      const partPath = `${sectionPath}.parts[${p}]`;
      const passage = part.passage ?? null;
      if (passage) {
        checkPassage(passage, `${partPath}.passage`);
      }
      if (!part.groups?.length) {
        error(partPath, 'a part needs at least one question group');
        return;
      }

      part.groups.forEach((group, g) => {
        const groupPath = `${partPath}.groups[${g}]`;
        const type = group.questionType;
        if (!Object.values(QuestionType).includes(type)) {
          error(groupPath, `unknown question type ${String(type)}`);
          return;
        }
        if (!group.questions?.length) {
          error(groupPath, 'a group needs at least one question');
          return;
        }

        attempt(groupPath, () => assertValidGroupContent(type, group.content));
        checkPlaceholders(group, groupPath);
        checkParagraphLetters(group, passage, groupPath);

        group.questions.forEach((question, q) => {
          const path = `${groupPath}.questions[${q}]`;
          const numberTo = question.numberTo ?? question.numberFrom;
          if (question.numberFrom !== next) {
            error(
              path,
              `expected question ${next}, got ${question.numberFrom} (numbering restarts at 1 in every section)`,
            );
          }
          next = Math.max(next, numberTo + 1);
          checkQuestion(group, question, numberTo, passage, path);
        });
      });
    });
  });

  return issues;

  function checkPassage(passage: IImportPassage, path: string) {
    if (!passage.title?.trim()) {
      error(path, 'passage title is required');
    }
    if (!passage.paragraphs?.length) {
      error(path, 'a passage needs at least one paragraph');
      return;
    }
    passage.paragraphs.forEach((text, i) => {
      if (!text?.trim()) {
        error(`${path}.paragraphs[${i}]`, 'paragraph is empty');
      } else if (
        passage.markedBy === MarkedBy.ALPHABET &&
        new RegExp(`^${letterOf(i)}\\s`).test(text)
      ) {
        warn(
          `${path}.paragraphs[${i}]`,
          `starts with its own label "${letterOf(i)}"; labels are rendered from markedBy`,
        );
      }
    });
  }

  function checkPlaceholders(group: IImportGroup, path: string) {
    const placeholders = placeholdersOf(group.content);
    if (!placeholders) {
      return;
    }
    const numbers = group.questions.map((q) => q.numberFrom);
    const missing = numbers.filter((n) => !placeholders.includes(n));
    const orphan = placeholders.filter((n) => !numbers.includes(n));
    if (missing.length) {
      error(path, `no {{n}} placeholder for question(s) ${missing.join(', ')}`);
    }
    if (orphan.length) {
      error(
        path,
        `placeholder(s) {{${orphan.join('}}, {{')}}} have no question`,
      );
    }
  }

  function checkParagraphLetters(
    group: IImportGroup,
    passage: IImportPassage | null,
    path: string,
  ) {
    if (
      group.questionType !== QuestionType.MATCHING_INFORMATION ||
      passage?.markedBy !== MarkedBy.ALPHABET ||
      !Array.isArray(group.content?.options)
    ) {
      return;
    }
    const keys = (group.content.options as { key: string }[]).map((o) => o.key);
    const letters = passage.paragraphs.map((_, i) => letterOf(i));
    if (keys.join() !== letters.join()) {
      warn(
        path,
        `options ${keys.join(',')} differ from the passage paragraphs ${letters.join(',')}`,
      );
    }
  }

  function checkQuestion(
    group: IImportGroup,
    question: IImportQuestion,
    numberTo: number,
    passage: IImportPassage | null,
    path: string,
  ) {
    const type = group.questionType;
    const { numberFrom, answer } = question;

    if (
      (PROMPTED_TYPES.has(type) ||
        (type === QuestionType.SENTENCE_COMPLETION && !group.content)) &&
      !question.prompt?.trim()
    ) {
      error(path, `question ${numberFrom} (${type}) needs a prompt`);
    }
    if (!answer || typeof answer !== 'object') {
      error(path, `question ${numberFrom} has no answer`);
      return;
    }

    attempt(path, () =>
      assertValidQuestionContent(type, question.content, numberFrom),
    );
    attempt(path, () =>
      assertValidAnswer(type, { answer, numberFrom, numberTo }),
    );
    attempt(path, () => assertAnswerFitsGroup(type, group, question));

    if (passage && Array.isArray(answer.accepted)) {
      const text = passage.paragraphs.join('\n');
      for (const value of answer.accepted as string[]) {
        if (typeof value === 'string' && !contains(text, value)) {
          warn(
            path,
            `answer "${value}" to ${numberFrom} is not in the passage`,
          );
        }
      }
    }

    checkEvidence(question, passage, path);
  }

  function checkEvidence(
    { evidence, numberFrom }: IImportQuestion,
    passage: IImportPassage | null,
    path: string,
  ) {
    if (!evidence) {
      return;
    }
    const { paragraph, quote } = evidence;
    if (paragraph === undefined && !quote?.trim()) {
      error(path, `evidence of ${numberFrom} needs a paragraph and/or a quote`);
      return;
    }
    if (!passage) {
      error(
        path,
        `evidence of ${numberFrom} points into a part with no passage`,
      );
      return;
    }
    const count = passage.paragraphs.length;
    if (
      paragraph !== undefined &&
      (!Number.isInteger(paragraph) || paragraph < 1 || paragraph > count)
    ) {
      error(path, `evidence paragraph ${paragraph} is outside 1-${count}`);
      return;
    }
    if (!quote?.trim()) {
      return;
    }
    const found = passage.paragraphs.findIndex((text) => contains(text, quote));
    if (found === -1) {
      error(path, `evidence quote of ${numberFrom} is not in the passage`);
    } else if (
      paragraph !== undefined &&
      !contains(passage.paragraphs[paragraph - 1], quote)
    ) {
      error(
        path,
        `evidence quote of ${numberFrom} is in paragraph ${found + 1}, not ${paragraph}`,
      );
    }
  }
}
