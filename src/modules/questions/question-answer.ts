import { BadRequestException } from '@nestjs/common';

import { QuestionType } from '../../types/test.type.js';
import { type Fail, isNonEmptyString, isPlainObject } from './json-shape.js';

type AnswerKind = 'key' | 'keys' | 'accepted' | 'sample';

const KEY = ['key'] as const;
const ACCEPTED = ['accepted'] as const;
const SAMPLE = ['sample'] as const;
const WORD_BANK = ['accepted', 'key'] as const;

const QUESTION_ANSWER_KINDS: Record<QuestionType, readonly AnswerKind[]> = {
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
  // Completion types with an optional word bank: free text or an option key
  [QuestionType.SENTENCE_COMPLETION]: WORD_BANK,
  [QuestionType.SUMMARY_COMPLETION]: WORD_BANK,
  [QuestionType.NOTE_COMPLETION]: WORD_BANK,
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
  switch (kind) {
    case 'key':
    case 'sample':
      if (!isNonEmptyString(value)) fail(`${kind} must be a non-empty string`);
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

type OptionSource = 'group' | 'question' | readonly string[];

// Where the keys an answer may pick from live; types not listed have no fixed set
const OPTION_SOURCES: Partial<Record<QuestionType, OptionSource>> = {
  [QuestionType.MULTIPLE_CHOICE]: 'question',
  [QuestionType.MULTIPLE_CHOICE_MULTI]: 'question',
  [QuestionType.TRUE_FALSE_NOT_GIVEN]: ['TRUE', 'FALSE', 'NOT GIVEN'],
  [QuestionType.YES_NO_NOT_GIVEN]: ['YES', 'NO', 'NOT GIVEN'],
  [QuestionType.MATCHING_HEADINGS]: 'group',
  [QuestionType.MATCHING_INFORMATION]: 'group',
  [QuestionType.MATCHING_FEATURES]: 'group',
  [QuestionType.MATCHING_SENTENCE_ENDINGS]: 'group',
  [QuestionType.CLASSIFICATION]: 'group',
  [QuestionType.SENTENCE_COMPLETION]: 'group',
  [QuestionType.SUMMARY_COMPLETION]: 'group',
  [QuestionType.NOTE_COMPLETION]: 'group',
  [QuestionType.MAP_LABELLING]: 'group',
  [QuestionType.PLAN_LABELLING]: 'group',
  [QuestionType.PHOTO_DESCRIPTION]: 'question',
  [QuestionType.QUESTION_RESPONSE]: 'question',
  [QuestionType.TEXT_COMPLETION]: 'question',
};

type Content = Record<string, unknown> | null | undefined;

function optionKeys(content: Content) {
  const options = content?.options;
  if (!Array.isArray(options)) return undefined;

  return options.flatMap((o) =>
    isPlainObject(o) && typeof o.key === 'string' ? [o.key] : [],
  );
}

// Runs after the answer and both contents passed their shape checks
export function assertAnswerInOptions(
  type: QuestionType,
  {
    answer,
    numberFrom,
    content,
  }: Pick<IAnswerTarget, 'answer' | 'numberFrom'> & { content?: Content },
  groupContent: Content,
) {
  const source = OPTION_SOURCES[type];
  const picked =
    typeof answer.key === 'string'
      ? [answer.key]
      : Array.isArray(answer.keys)
        ? (answer.keys as string[])
        : [];
  if (!source || !picked.length) return;

  const keys =
    source === 'group'
      ? optionKeys(groupContent)
      : source === 'question'
        ? optionKeys(content)
        : source;
  const fail: Fail = (reason) => {
    throw new BadRequestException(
      `Invalid answer for question ${numberFrom} (${type}): ${reason}`,
    );
  };

  if (!keys) {
    fail(
      source === 'group'
        ? 'the group has no options to pick from; use {"accepted":[...]} or add options to the group content'
        : 'the question has no options to pick from',
    );
  }
  const unknown = picked.filter((key) => !keys.includes(key));
  if (unknown.length) {
    fail(`${unknown.join(', ')} not among the options (${keys.join(', ')})`);
  }
}
