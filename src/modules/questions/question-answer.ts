import { BadRequestException } from '@nestjs/common';

import { QuestionType } from '../../types/test.type.js';
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

export const FIXED_ANSWER_KEYS: Partial<
  Record<QuestionType, ReadonlySet<string>>
> = {
  [QuestionType.TRUE_FALSE_NOT_GIVEN]: new Set(['TRUE', 'FALSE', 'NOT GIVEN']),
  [QuestionType.YES_NO_NOT_GIVEN]: new Set(['YES', 'NO', 'NOT GIVEN']),
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
