import {
  countWords,
  gradeAnswer,
  maxScoreOf,
  normalizeText,
} from './attempt-grader.js';

const single = { numberFrom: 1, numberTo: 1 };
const multi = { numberFrom: 21, numberTo: 22 };

describe('gradeAnswer', () => {
  describe('key', () => {
    const q = { ...single, answer: { key: 'B' } };

    it('scores a matching key', () => {
      expect(gradeAnswer(q, { key: 'B' })).toEqual({
        isCorrect: true,
        score: 1,
      });
    });

    it('scores a different key as wrong', () => {
      expect(gradeAnswer(q, { key: 'C' })).toEqual({
        isCorrect: false,
        score: 0,
      });
    });

    it('ignores surrounding whitespace', () => {
      expect(gradeAnswer(q, { key: ' B ' })).toEqual({
        isCorrect: true,
        score: 1,
      });
    });

    it('grades a response of the wrong kind as wrong', () => {
      expect(gradeAnswer(q, { text: 'B' })).toEqual({
        isCorrect: false,
        score: 0,
      });
    });
  });

  describe('keys', () => {
    const q = { ...multi, answer: { keys: ['A', 'D'] } };

    it('ignores order', () => {
      expect(gradeAnswer(q, { keys: ['D', 'A'] })).toEqual({
        isCorrect: true,
        score: 2,
      });
    });

    it('gives partial credit', () => {
      expect(gradeAnswer(q, { keys: ['A', 'C'] })).toEqual({
        isCorrect: false,
        score: 1,
      });
    });

    it('does not count duplicates twice', () => {
      expect(gradeAnswer(q, { keys: ['A', 'A'] })).toEqual({
        isCorrect: false,
        score: 1,
      });
    });
  });

  describe('accepted', () => {
    const q = { ...single, answer: { accepted: ['colour', 'color'] } };

    it('normalises case, whitespace and punctuation', () => {
      expect(gradeAnswer(q, { text: '  Colour. ' })).toEqual({
        isCorrect: true,
        score: 1,
      });
      expect(gradeAnswer(q, { text: 'COLOR' })).toEqual({
        isCorrect: true,
        score: 1,
      });
    });

    it('ignores surrounding quotes', () => {
      expect(
        gradeAnswer(
          { ...single, answer: { accepted: ['color'] } },
          { text: '"color"' },
        ),
      ).toEqual({
        isCorrect: true,
        score: 1,
      });
    });

    it('rejects other words', () => {
      expect(gradeAnswer(q, { text: 'colours' })).toEqual({
        isCorrect: false,
        score: 0,
      });
    });

    it('treats curly quotes as straight', () => {
      const apostrophe = { ...single, answer: { accepted: ["children's"] } };

      expect(gradeAnswer(apostrophe, { text: 'Children’s' })).toEqual({
        isCorrect: true,
        score: 1,
      });
    });

    it('enforces the word limit', () => {
      const limited = {
        ...single,
        wordLimit: 2,
        answer: { accepted: ['train station', 'the train station'] },
      };

      expect(gradeAnswer(limited, { text: 'the train station' })).toEqual({
        isCorrect: false,
        score: 0,
      });
      expect(gradeAnswer(limited, { text: 'train station' })).toEqual({
        isCorrect: true,
        score: 1,
      });
    });
  });

  describe('blank and ungraded', () => {
    const text = { ...single, answer: { accepted: ['x'] } };

    it.each([null, undefined, { text: '   ' }, { keys: [] }])(
      'treats %j as blank',
      (response) => {
        expect(gradeAnswer(text, response)).toEqual({
          isCorrect: null,
          score: 0,
        });
      },
    );

    it('does not grade sample answers', () => {
      expect(
        gradeAnswer({ ...single, answer: { sample: 'x' } }, { text: 'x' }),
      ).toEqual({
        isCorrect: null,
        score: 0,
      });
    });
  });
});

describe('helpers', () => {
  it('counts a hyphenated word and a number as one word each', () => {
    expect(countWords(normalizeText('well-known 1990'))).toBe(2);
  });

  it('normalises quotes, spacing and edge punctuation', () => {
    expect(normalizeText('  “Hello”,   World! ')).toBe('hello", world');
  });

  it('derives the max score from the number range', () => {
    expect(maxScoreOf(multi)).toBe(2);
  });
});
