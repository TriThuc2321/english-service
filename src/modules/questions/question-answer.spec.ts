import { BadRequestException } from '@nestjs/common';

import { QuestionType } from '../../types/test.type.js';
import { assertValidAnswer, type IAnswerTarget } from './question-answer.js';

const single = (answer: Record<string, unknown>): IAnswerTarget => ({
  answer,
  numberFrom: 1,
  numberTo: 1,
});

describe('assertValidAnswer', () => {
  it.each<[QuestionType, IAnswerTarget]>([
    [QuestionType.MULTIPLE_CHOICE, single({ key: 'B' })],
    [
      QuestionType.MULTIPLE_CHOICE_MULTI,
      { answer: { keys: ['A', 'D'] }, numberFrom: 5, numberTo: 6 },
    ],
    [
      QuestionType.SENTENCE_COMPLETION,
      single({ accepted: ['colour', 'color'] }),
    ],
    [QuestionType.SUMMARY_COMPLETION, single({ accepted: ['river'] })],
    [QuestionType.SUMMARY_COMPLETION, single({ key: 'C' })],
    [QuestionType.OPINION_ESSAY, single({ sample: 'An essay' })],
    [
      QuestionType.READ_ALOUD,
      single({ sample: 'Text', rubric: { fluency: 'clear' } }),
    ],
  ])('accepts a valid %s answer', (type, target) => {
    expect(() => assertValidAnswer(type, target)).not.toThrow();
  });

  it.each<[string, QuestionType, IAnswerTarget, RegExp]>([
    [
      'numberTo before numberFrom',
      QuestionType.MULTIPLE_CHOICE,
      { answer: { key: 'A' }, numberFrom: 3, numberTo: 2 },
      /numberTo must be >= numberFrom/,
    ],
    [
      'a shape the type does not take',
      QuestionType.MULTIPLE_CHOICE,
      single({ accepted: ['A'] }),
      /unsupported shape/,
    ],
    [
      'two answer kinds at once',
      QuestionType.SUMMARY_COMPLETION,
      single({ key: 'A', accepted: ['river'] }),
      /unsupported shape/,
    ],
    [
      'an unexpected field',
      QuestionType.MULTIPLE_CHOICE,
      single({ key: 'A', note: 'x' }),
      /unexpected field\(s\) note/,
    ],
    [
      'a range on a single-key answer',
      QuestionType.MULTIPLE_CHOICE,
      { answer: { key: 'A' }, numberFrom: 1, numberTo: 2 },
      /only allowed for multi-key answers/,
    ],
    [
      'a blank key',
      QuestionType.MULTIPLE_CHOICE,
      single({ key: '  ' }),
      /key must be a non-empty string/,
    ],
    [
      'a non-object rubric',
      QuestionType.OPINION_ESSAY,
      single({ sample: 'Essay', rubric: ['x'] }),
      /rubric must be an object/,
    ],
    [
      'duplicate keys',
      QuestionType.MULTIPLE_CHOICE_MULTI,
      { answer: { keys: ['A', 'A'] }, numberFrom: 1, numberTo: 2 },
      /keys must be unique/,
    ],
    [
      'a key count that does not match the range',
      QuestionType.MULTIPLE_CHOICE_MULTI,
      { answer: { keys: ['A', 'B', 'C'] }, numberFrom: 1, numberTo: 2 },
      /need exactly 2 keys/,
    ],
    [
      'an empty accepted list',
      QuestionType.SHORT_ANSWER,
      single({ accepted: [] }),
      /accepted must be a non-empty array/,
    ],
  ])('rejects %s', (_, type, target, message) => {
    expect(() => assertValidAnswer(type, target)).toThrow(BadRequestException);
    expect(() => assertValidAnswer(type, target)).toThrow(message);
  });
});
