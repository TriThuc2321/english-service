import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { QuestionType } from '../../types/test.type.js';
import { type ITreeQuestion, parseResponse } from './attempt-response.js';

const question = (overrides: Partial<ITreeQuestion>): ITreeQuestion => ({
  id: 1,
  sectionId: 1,
  questionType: QuestionType.MULTIPLE_CHOICE,
  wordLimit: null,
  numberFrom: 1,
  numberTo: 1,
  keys: new Set(['A', 'B', 'C']),
  ...overrides,
});

describe('parseResponse', () => {
  it('returns null for a null response', () => {
    expect(parseResponse(question({}), null)).toBeNull();
  });

  describe('MULTIPLE_CHOICE', () => {
    it('accepts a known key', () => {
      expect(parseResponse(question({}), { key: 'B' })).toEqual({ key: 'B' });
    });

    it.each([{ key: 'Z' }, { text: 'B' }, { key: 'B', extra: 1 }, { key: '' }])(
      'rejects %j',
      (raw) => {
        expect(() => parseResponse(question({}), raw)).toThrow(
          BadRequestException,
        );
      },
    );
  });

  describe('MULTIPLE_CHOICE_MULTI', () => {
    const multi = question({
      questionType: QuestionType.MULTIPLE_CHOICE_MULTI,
      numberFrom: 21,
      numberTo: 22,
    });

    it('accepts up to the question span', () => {
      expect(parseResponse(multi, { keys: ['A', 'C'] })).toEqual({
        keys: ['A', 'C'],
      });
    });

    it.each([
      { keys: ['A', 'B', 'C'] },
      { keys: ['A', 'A'] },
      { keys: [] },
      { keys: [''] },
      { keys: ['Z'] },
    ])('rejects %j', (raw) => {
      expect(() => parseResponse(multi, raw)).toThrow(BadRequestException);
    });
  });

  describe('free text', () => {
    const form = question({
      questionType: QuestionType.FORM_COMPLETION,
      keys: null,
    });

    it('accepts text and blank text', () => {
      expect(parseResponse(form, { text: 'abc' })).toEqual({ text: 'abc' });
      expect(parseResponse(form, { text: '  ' })).toEqual({ text: '  ' });
    });

    it.each([{ text: 'a'.repeat(256) }, { key: 'A' }, { text: 1 }])(
      'rejects %j',
      (raw) => {
        expect(() => parseResponse(form, raw)).toThrow(BadRequestException);
      },
    );
  });

  describe('SUMMARY_COMPLETION', () => {
    it('takes a key when the word bank exists', () => {
      const q = question({ questionType: QuestionType.SUMMARY_COMPLETION });
      expect(parseResponse(q, { key: 'A' })).toEqual({ key: 'A' });
      expect(() => parseResponse(q, { text: 'x' })).toThrow(
        BadRequestException,
      );
    });

    it('takes text when there is no word bank', () => {
      const q = question({
        questionType: QuestionType.SUMMARY_COMPLETION,
        keys: null,
      });
      expect(parseResponse(q, { text: 'x' })).toEqual({ text: 'x' });
      expect(() => parseResponse(q, { key: 'A' })).toThrow(BadRequestException);
    });
  });

  it('accepts any non-empty key when keys is null', () => {
    const q = question({
      questionType: QuestionType.TRUE_FALSE_NOT_GIVEN,
      keys: null,
    });
    expect(parseResponse(q, { key: 'NOT GIVEN' })).toEqual({
      key: 'NOT GIVEN',
    });
  });

  it('rejects questions that are not auto-gradable', () => {
    const q = question({ questionType: QuestionType.OPINION_ESSAY });
    expect(() => parseResponse(q, { text: 'essay' })).toThrow(
      BadRequestException,
    );
  });

  it('names the question in the error', () => {
    expect(() =>
      parseResponse(question({ numberFrom: 7 }), { key: 'Z' }),
    ).toThrow(/question 7/);
  });
});
