import { BadRequestException } from '@nestjs/common';

import { QuestionType } from '../../types/test.type.js';
import {
  assertAnswerFitsGroup,
  assertValidAnswer,
  type IAnswerGroup,
  type IAnswerTarget,
} from './question-answer.js';

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
    [QuestionType.TRUE_FALSE_NOT_GIVEN, single({ key: 'NOT GIVEN' })],
    [QuestionType.YES_NO_NOT_GIVEN, single({ key: 'YES' })],
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
      'a key outside the TRUE/FALSE/NOT GIVEN set',
      QuestionType.TRUE_FALSE_NOT_GIVEN,
      single({ key: 'YES' }),
      /key must be one of TRUE, FALSE, NOT GIVEN/,
    ],
    [
      'a key outside the YES/NO/NOT GIVEN set',
      QuestionType.YES_NO_NOT_GIVEN,
      single({ key: 'NG' }),
      /key must be one of YES, NO, NOT GIVEN/,
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

describe('assertAnswerFitsGroup', () => {
  const options = (...keys: string[]) => ({
    options: keys.map((key) => ({ key, text: key })),
  });
  const wordBank: IAnswerGroup = {
    content: { template: '{{1}}', ...options('A', 'B', 'C') },
  };
  const freeText: IAnswerGroup = { content: { template: '{{1}}' } };

  type Case = [
    string,
    QuestionType,
    IAnswerGroup,
    Record<string, unknown>,
    Record<string, unknown>?,
  ];

  it.each<Case>([
    [
      'a word-bank summary key',
      QuestionType.SUMMARY_COMPLETION,
      wordBank,
      { key: 'B' },
    ],
    [
      'a free-text summary',
      QuestionType.SUMMARY_COMPLETION,
      freeText,
      { accepted: ['river'] },
    ],
    [
      'a key from the group options',
      QuestionType.MATCHING_HEADINGS,
      { content: options('i', 'ii') },
      { key: 'ii' },
    ],
    [
      'a key from the question options',
      QuestionType.MULTIPLE_CHOICE,
      {},
      { key: 'C' },
      options('A', 'B', 'C'),
    ],
    [
      'keys from the question options',
      QuestionType.MULTIPLE_CHOICE_MULTI,
      {},
      { keys: ['A', 'D'] },
      options('A', 'B', 'C', 'D'),
    ],
    [
      'a fixed TFNG key',
      QuestionType.TRUE_FALSE_NOT_GIVEN,
      {},
      { key: 'TRUE' },
    ],
    [
      'accepted text within the word limit',
      QuestionType.SENTENCE_COMPLETION,
      { wordLimit: 2 },
      { accepted: ['old bridge', 'bridge.'] },
    ],
    [
      'any length when there is no word limit',
      QuestionType.SHORT_ANSWER,
      { wordLimit: null },
      { accepted: ['a very long answer indeed'] },
    ],
  ])('accepts %s', (_, type, group, answer, content) => {
    expect(() =>
      assertAnswerFitsGroup(type, group, { answer, content, numberFrom: 1 }),
    ).not.toThrow();
  });

  it.each<[...Case, RegExp]>([
    [
      'accepted text when the summary has a word bank',
      QuestionType.SUMMARY_COMPLETION,
      wordBank,
      { accepted: ['river'] },
      undefined,
      /word bank, so the answer must be a key/,
    ],
    [
      'a key when the summary has no word bank',
      QuestionType.SUMMARY_COMPLETION,
      freeText,
      { key: 'A' },
      undefined,
      /no word bank, so the answer must be accepted text/,
    ],
    [
      'a key outside the group options',
      QuestionType.MATCHING_FEATURES,
      { content: options('A', 'B') },
      { key: 'C' },
      undefined,
      /unknown key "C"; expected one of A, B/,
    ],
    [
      'a key outside the question options',
      QuestionType.TEXT_COMPLETION,
      {},
      { key: 'E' },
      options('A', 'B', 'C', 'D'),
      /unknown key "E"/,
    ],
    [
      'one of several keys outside the options',
      QuestionType.MULTIPLE_CHOICE_MULTI,
      {},
      { keys: ['A', 'F'] },
      options('A', 'B', 'C'),
      /unknown key "F"/,
    ],
    [
      'accepted text over the word limit',
      QuestionType.NOTE_COMPLETION,
      { wordLimit: 2 },
      { accepted: ['bridge', 'the old bridge'] },
      undefined,
      /"the old bridge" exceeds the word limit of 2/,
    ],
    [
      'accepted text made only of punctuation',
      QuestionType.SHORT_ANSWER,
      {},
      { accepted: ['...'] },
      undefined,
      /empty once punctuation is stripped/,
    ],
  ])('rejects %s', (_, type, group, answer, content, message) => {
    const run = () =>
      assertAnswerFitsGroup(type, group, { answer, content, numberFrom: 1 });
    expect(run).toThrow(BadRequestException);
    expect(run).toThrow(message);
  });
});
