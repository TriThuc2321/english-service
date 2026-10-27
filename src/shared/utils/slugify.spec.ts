import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from './slugify.js';

describe('slugify', () => {
  it.each([
    ['Cambridge IELTS 18 - Test 1', 'cambridge-ielts-18-test-1'],
    ['  Đề thi TOEIC thử số 3!  ', 'de-thi-toeic-thu-so-3'],
    ['Reading & Listening (2024)', 'reading-listening-2024'],
    ['!!!', ''],
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(SLUG_MAX_LENGTH - 1)} b`);

    expect(slug).toBe('a'.repeat(SLUG_MAX_LENGTH - 1));
    expect(slug).toMatch(SLUG_PATTERN);
  });
});
