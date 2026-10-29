import { BadRequestException } from '@nestjs/common';

import { QuestionType } from '../../types/test.type.js';
import {
  answerKeysOf,
  countWords,
  FIXED_ANSWER_KEYS,
  normalizeText,
  optionKeys,
} from './answer-text.js';
import { type Fail, isNonEmptyString, isPlainObject } from './json-shape.js';

export type AnswerKind = 'key' | 'keys' | 'accepted' | 'sample';

const KEY = ['key'] as const;
const ACCEPTED = ['accepted'] as const;
const SAMPLE = ['sample'] as const;

export const QUESTION_ANSWER_KINDS: Record<
  QuestionType,
  readonly AnswerKind[]
> = {
  [QuestionType.MULTIPLE_CHOICE]: KEY,
  [QuestionType.MULTIPLE_CHOICE_MULTI]: ['keys'],
  [QuestionType.TRUE_FALSE_NOT_GIVEN]: KEY,
  [QuestionType.YES_NO_NOT_GIVEN]: KEY,
  [QuestionType.MATCHING_HEADINGS]: KEY,
  [QuestionType.MATCHING_INFORMATION]: KEY,
  [QuestionType.MATCHING_FEATURES]: KEY,
  [QuestionType.MATCHING_SENTENCE_ENDINGS]: KEY,
  [QuestionType.CLASSIFICATION]: KEY,
  [QuestionType.FORM_COMPLETION]: ACCEPTED,
  [QuestionType.SENTENCE_COMPLETION]: ACCEPTED,
  // Either free text or a letter from a word bank
  [QuestionType.SUMMARY_COMPLETION]: ['accepted', 'key'],
  [QuestionType.NOTE_COMPLETION]: ACCEPTED,
  [QuestionType.TABLE_COMPLETION]: ACCEPTED,
  [QuestionType.FLOW_CHART_COMPLETION]: ACCEPTED,
  [QuestionType.DIAGRAM_LABELLING]: ACCEPTED,
  [QuestionType.MAP_LABELLING]: KEY,
  [QuestionType.PLAN_LABELLING]: KEY,
  [QuestionType.SHORT_ANSWER]: ACCEPTED,
  [QuestionType.PHOTO_DESCRIPTION]: KEY,
  [QuestionType.QUESTION_RESPONSE]: KEY,
  [QuestionType.TEXT_COMPLETION]: KEY,
  [QuestionType.READ_ALOUD]: SAMPLE,
  [QuestionType.DESCRIBE_PICTURE]: SAMPLE,
  [QuestionType.RESPOND_TO_QUESTIONS]: SAMPLE,
  [QuestionType.RESPOND_USING_INFO]: SAMPLE,
  [QuestionType.EXPRESS_OPINION]: SAMPLE,
  [QuestionType.WRITE_SENTENCE_PICTURE]: SAMPLE,
  [QuestionType.RESPOND_WRITTEN_REQUEST]: SAMPLE,
  [QuestionType.OPINION_ESSAY]: SAMPLE,
};

const SHAPES: Record<AnswerKind, string> = {
  key: '{"key":"B"}',
  keys: '{"keys":["A","D"]}',
  accepted: '{"accepted":["colour","color"]}',
  sample: '{"sample":"...","rubric":{...}}',
};

export interface IAnswerTarget {
  answer: Record<string, unknown>;
  numberFrom: number;
  numberTo: number;
}

export function assertValidAnswer(
  type: QuestionType,
  { answer, numberFrom, numberTo }: IAnswerTarget,
) {
  const allowed = QUESTION_ANSWER_KINDS[type];
  const kinds = Object.keys(answer).filter((k): k is AnswerKind => k in SHAPES);
  const kind = kinds[0];
  const fail: Fail = (reason) => {
    throw new BadRequestException(
      `Invalid answer for question ${numberFrom} (${type}): ${reason}; expected ${allowed.map((k) => SHAPES[k]).join(' or ')}`,
    );
  };

  if (numberTo < numberFrom) {
    fail('numberTo must be >= numberFrom');
  }

  if (kinds.length !== 1 || !allowed.includes(kind)) {
    fail('unsupported shape');
  }

  const extra = Object.keys(answer).filter(
    (k) => k !== kind && !(kind === 'sample' && k === 'rubric'),
  );
  if (extra.length) {
    fail(`unexpected field(s) ${extra.join(', ')}`);
  }

  // Only "Choose TWO"-style answers can span several question numbers
  if (kind !== 'keys' && numberTo !== numberFrom) {
    fail('a number range is only allowed for multi-key answers');
  }

  const value = answer[kind];
  const fixedKeys = FIXED_ANSWER_KEYS[type];
  switch (kind) {
    case 'key':
    case 'sample':
      if (!isNonEmptyString(value)) fail(`${kind} must be a non-empty string`);
      if (kind === 'key' && fixedKeys && !fixedKeys.has(value as string)) {
        fail(`key must be one of ${[...fixedKeys].join(', ')}`);
      }
      if (
        kind === 'sample' &&
        answer.rubric !== undefined &&
        !isPlainObject(answer.rubric)
      ) {
        fail('rubric must be an object');
      }
      break;
    case 'keys': {
      const expected = numberTo - numberFrom + 1;
      if (
        !Array.isArray(value) ||
        !value.every(isNonEmptyString) ||
        new Set(value).size !== value.length
      ) {
        fail('keys must be unique non-empty strings');
      } else if (value.length !== expected) {
        fail(
          `questions ${numberFrom}-${numberTo} need exactly ${expected} keys`,
        );
      }
      break;
    }
    case 'accepted':
      if (
        !Array.isArray(value) ||
        !value.length ||
        !value.every(isNonEmptyString)
      ) {
        fail('accepted must be a non-empty array of non-empty strings');
      }
      break;
  }
}

type Content = Record<string, unknown> | null | undefined;

export interface IAnswerGroup {
  content?: Content;
  wordLimit?: number | null;
}

// The grader can only award what a student is able to submit: a key from the
// options on screen, or text within the word limit
export function assertAnswerFitsGroup(
  type: QuestionType,
  group: IAnswerGroup,
  q: { answer: Record<string, unknown>; content?: Content; numberFrom: number },
) {
  const fail: Fail = (reason) => {
    throw new BadRequestException(
      `Invalid answer for question ${q.numberFrom} (${type}): ${reason}`,
    );
  };
  const { answer } = q;

  if (type === QuestionType.SUMMARY_COMPLETION) {
    const hasWordBank = optionKeys(group.content) !== null;
    if (hasWordBank && !('key' in answer)) {
      fail('the group has a word bank, so the answer must be a key');
    }
    if (!hasWordBank && !('accepted' in answer)) {
      fail('the group has no word bank, so the answer must be accepted text');
    }
  }

  const keys = answerKeysOf(type, group.content, q.content);
  if (keys && ('key' in answer || 'keys' in answer)) {
    const given = ('keys' in answer ? answer.keys : [answer.key]) as string[];
    const unknown = given.find((k) => !keys.has(k));
    if (unknown !== undefined) {
      fail(`unknown key "${unknown}"; expected one of ${[...keys].join(', ')}`);
    }
  }

  if (Array.isArray(answer.accepted)) {
    for (const value of answer.accepted as string[]) {
      const normalized = normalizeText(value);
      if (!normalized) {
        fail(`accepted "${value}" is empty once punctuation is stripped`);
      }
      if (group.wordLimit && countWords(normalized) > group.wordLimit) {
        fail(
          `accepted "${value}" exceeds the word limit of ${group.wordLimit}`,
        );
      }
    }
  }
}
