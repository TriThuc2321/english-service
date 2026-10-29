import { BadRequestException } from '@nestjs/common';

import type { AttemptResponse } from './attempt-grader.js';
import type { ITreeQuestion } from './attempt-tree.service.js';

import { QuestionType } from '../../types/test.type.js';
import {
  assertOnlyFields,
  type Fail,
  isNonEmptyString,
  isPlainObject,
} from '../questions/json-shape.js';
import { QUESTION_ANSWER_KINDS } from '../questions/question-answer.js';

export type { ITreeQuestion } from './attempt-tree.service.js';

const MAX_TEXT_LENGTH = 255;

// A word-bank summary is answered with a key, a free-text one with text
function responseField(q: ITreeQuestion): 'key' | 'keys' | 'text' | null {
  const kinds = QUESTION_ANSWER_KINDS[q.questionType];
  if (kinds.includes('keys')) return 'keys';
  if (q.questionType === QuestionType.SUMMARY_COMPLETION) {
    return q.keys !== null ? 'key' : 'text';
  }
  if (kinds.includes('key')) return 'key';
  if (kinds.includes('accepted')) return 'text';
  return null;
}

export function parseResponse(
  q: ITreeQuestion,
  raw: unknown,
): AttemptResponse | null {
  if (raw === null) {
    return null;
  }

  const fail: Fail = (reason) => {
    throw new BadRequestException(
      `Invalid response for question ${q.numberFrom}: ${reason}`,
    );
  };

  const field = responseField(q);
  if (field === null) {
    fail('this question cannot be answered automatically');
  }
  if (!isPlainObject(raw)) {
    fail('expected an object');
  }
  assertOnlyFields(raw, [field], fail);
  const value = raw[field];

  if (field === 'key') {
    if (!isNonEmptyString(value)) {
      fail('key must be a non-empty string');
    }
    if (q.keys && !q.keys.has(value)) {
      fail(`unknown key "${value}"`);
    }
    return { key: value };
  }

  if (field === 'keys') {
    const max = q.numberTo - q.numberFrom + 1;
    if (!Array.isArray(value) || value.length < 1 || value.length > max) {
      fail(`keys must be an array of 1 to ${max} items`);
    }
    if (!value.every(isNonEmptyString)) {
      fail('keys must be non-empty strings');
    }
    if (new Set(value).size !== value.length) {
      fail('keys must be unique');
    }
    if (q.keys && !value.every((k) => q.keys?.has(k))) {
      fail('unknown key');
    }
    return { keys: value };
  }

  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
    fail(`text must be a string up to ${MAX_TEXT_LENGTH} characters`);
  }
  return { text: value };
}
