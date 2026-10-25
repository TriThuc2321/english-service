import { BadRequestException } from '@nestjs/common';

import { QuestionType } from '../../types/test.type.js';
import {
  assertValidEvidence,
  assertValidGroupContent,
  assertValidQuestionContent,
} from './question-content.js';

type Content = Record<string, unknown> | null;

describe('assertValidGroupContent', () => {
  it.each<[QuestionType, Content]>([
    [QuestionType.MULTIPLE_CHOICE, null],
    [
      QuestionType.MATCHING_HEADINGS,
      {
        options: [
          { key: 'i', text: 'First' },
          { key: 'ii', text: 'Second' },
        ],
        allowReuse: false,
      },
    ],
    [
      QuestionType.MATCHING_INFORMATION,
      { options: [{ key: 'A' }, { key: 'B' }] },
    ],
    [QuestionType.FORM_COMPLETION, { template: 'Name: {{1}}, Age: {{ 2 }}' }],
    [QuestionType.SENTENCE_COMPLETION, null],
    [
      QuestionType.SUMMARY_COMPLETION,
      {
        template: 'The {{14}} flows',
        options: [
          { key: 'A', text: 'river' },
          { key: 'B', text: 'road' },
        ],
      },
    ],
    [
      QuestionType.TABLE_COMPLETION,
      { table: { headers: ['Event', 'Date'], rows: [['Opening', '{{5}}']] } },
    ],
    [
      QuestionType.RESPOND_USING_INFO,
      { info: { title: 'Schedule', rows: [['9:00', 'Keynote']] } },
    ],
  ])('accepts valid %s content', (type, content) => {
    expect(() => assertValidGroupContent(type, content)).not.toThrow();
  });

  it.each<[string, QuestionType, Content, RegExp]>([
    [
      'missing required content',
      QuestionType.MATCHING_HEADINGS,
      null,
      /content is required/,
    ],
    [
      'content on a type that takes none',
      QuestionType.MULTIPLE_CHOICE,
      { options: [] },
      /takes no content/,
    ],
    [
      'fewer than 2 options',
      QuestionType.MAP_LABELLING,
      { options: [{ key: 'A' }] },
      /at least 2 items/,
    ],
    [
      'duplicate option keys',
      QuestionType.MAP_LABELLING,
      { options: [{ key: 'A' }, { key: 'A' }] },
      /duplicate option key A/,
    ],
    [
      'an option without required text',
      QuestionType.MATCHING_FEATURES,
      { options: [{ key: 'A', text: 'x' }, { key: 'B' }] },
      /option B needs a non-empty text/,
    ],
    [
      'a non-boolean allowReuse',
      QuestionType.CLASSIFICATION,
      {
        options: [
          { key: 'A', text: 'x' },
          { key: 'B', text: 'y' },
        ],
        allowReuse: 'yes',
      },
      /allowReuse must be a boolean/,
    ],
    [
      'a template without placeholders',
      QuestionType.NOTE_COMPLETION,
      { template: 'No gaps' },
      /at least one \{\{n\}\} placeholder/,
    ],
    [
      'a malformed placeholder',
      QuestionType.NOTE_COMPLETION,
      { template: 'Gap {{1}} and {{x}}' },
      /placeholders must look like/,
    ],
    [
      'a repeated placeholder',
      QuestionType.FLOW_CHART_COMPLETION,
      { template: '{{3}} then {{3}}' },
      /\{\{3\}\} appears more than once/,
    ],
    [
      'a table repeating a placeholder across cells',
      QuestionType.TABLE_COMPLETION,
      { table: { rows: [['{{1}}'], ['{{1}}']] } },
      /appears more than once/,
    ],
    [
      'a non-string info title',
      QuestionType.RESPOND_USING_INFO,
      { info: { title: 1, rows: [['a']] } },
      /info.title must be a string/,
    ],
  ])('rejects %s', (_, type, content, message) => {
    expect(() => assertValidGroupContent(type, content)).toThrow(
      BadRequestException,
    );
    expect(() => assertValidGroupContent(type, content)).toThrow(message);
  });
});

describe('assertValidQuestionContent', () => {
  it('accepts multiple-choice options with text', () => {
    expect(() =>
      assertValidQuestionContent(
        QuestionType.MULTIPLE_CHOICE,
        {
          options: [
            { key: 'A', text: 'Yes' },
            { key: 'B', text: 'No' },
          ],
        },
        1,
      ),
    ).not.toThrow();
  });

  it('accepts text-less options for audio-only choices', () => {
    expect(() =>
      assertValidQuestionContent(
        QuestionType.QUESTION_RESPONSE,
        { options: [{ key: 'A' }, { key: 'B' }, { key: 'C' }] },
        7,
      ),
    ).not.toThrow();
  });

  it.each<[string, Content, RegExp]>([
    [
      'a negative prep time',
      { prepSeconds: -1 },
      /prepSeconds must be an integer >= 0/,
    ],
    [
      'a zero response time',
      { responseSeconds: 0 },
      /responseSeconds must be an integer >= 1/,
    ],
    ['a fractional time', { prepSeconds: 1.5 }, /prepSeconds/],
    [
      'an unknown field',
      { prepSeconds: 30, limit: 1 },
      /unexpected field\(s\) limit/,
    ],
  ])('rejects timing with %s', (_, content, message) => {
    expect(() =>
      assertValidQuestionContent(QuestionType.READ_ALOUD, content, 3),
    ).toThrow(message);
  });

  it('includes the question number in the error', () => {
    expect(() =>
      assertValidQuestionContent(QuestionType.SHORT_ANSWER, { x: 1 }, 12),
    ).toThrow(/question 12 \(SHORT_ANSWER\)/);
  });
});

describe('assertValidEvidence', () => {
  it.each<Content>([
    null,
    { paragraphId: 3 },
    { quote: 'the river flows' },
    { paragraphId: 1, quote: 'x' },
  ])('accepts %o', (evidence) => {
    expect(() => assertValidEvidence(evidence, 1)).not.toThrow();
  });

  it.each<[string, Content, RegExp]>([
    ['an empty object', {}, /needs paragraphId and\/or quote/],
    ['a zero paragraphId', { paragraphId: 0 }, /positive integer/],
    ['a string paragraphId', { paragraphId: '3' }, /positive integer/],
    ['a blank quote', { quote: ' ' }, /quote must be a non-empty string/],
    ['an unknown field', { quote: 'x', page: 2 }, /unexpected field\(s\) page/],
  ])('rejects %s', (_, evidence, message) => {
    expect(() => assertValidEvidence(evidence, 1)).toThrow(message);
  });
});
