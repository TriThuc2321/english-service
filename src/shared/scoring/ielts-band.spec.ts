import { AttemptMode } from '../../types/attempt.type.js';
import { ExamType, SkillType } from '../../types/test.type.js';
import {
  criteriaBand,
  overallScoreOf,
  roundBand,
  writingBand,
} from './ielts-band.js';

const skills = (
  listening: number | null | undefined,
  reading: number | null | undefined,
  writing: number | null | undefined,
  speaking: number | null | undefined,
): Map<SkillType, number | null | undefined> =>
  new Map([
    [SkillType.LISTENING, listening],
    [SkillType.READING, reading],
    [SkillType.WRITING, writing],
    [SkillType.SPEAKING, speaking],
  ]);

const ielts = { examType: ExamType.IELTS_ACADEMIC, mode: AttemptMode.FULL };

describe('ielts band calculation', () => {
  it.each([
    [6.25, 6.5],
    [6.75, 7],
    [6.125, 6],
    [6.375, 6.5],
    [6.6, 6.5],
    [9, 9],
    [0, 0],
  ])('rounds %d to %d', (value, band) => {
    expect(roundBand(value)).toBe(band);
  });

  it('averages criteria', () => {
    expect(criteriaBand([7, 6.5, 7, 6])).toBe(6.5);
    expect(criteriaBand([6, 6, 6, 7])).toBe(6.5);
    expect(criteriaBand([6, 7, 7, 7])).toBe(7);
  });

  it('weights Task 2 double', () => {
    expect(writingBand(7, 6.5)).toBe(6.5);
    expect(writingBand(6, 7)).toBe(6.5);
    expect(writingBand(5, 8)).toBe(7);
  });

  it('averages four skills for a FULL IELTS attempt', () => {
    expect(
      overallScoreOf({ ...ielts, scaledBySkill: skills(7, 6, 6, 6) }),
    ).toBe(6.5);
    expect(
      overallScoreOf({ ...ielts, scaledBySkill: skills(7, 7, 7, 6) }),
    ).toBe(7);
  });

  it('counts a blank skill as 0', () => {
    expect(
      overallScoreOf({ ...ielts, scaledBySkill: skills(8, 8, 0, 8) }),
    ).toBe(6);
  });

  it('stays null until all four exist', () => {
    expect(
      overallScoreOf({ ...ielts, scaledBySkill: skills(7, 7, 7, null) }),
    ).toBeNull();
  });

  it('stays null in SECTION mode', () => {
    expect(
      overallScoreOf({
        ...ielts,
        mode: AttemptMode.SECTION,
        scaledBySkill: skills(7, 7, 7, 7),
      }),
    ).toBeNull();
  });

  it('keeps TOEIC as L + R', () => {
    expect(
      overallScoreOf({
        examType: ExamType.TOEIC_LR,
        mode: AttemptMode.FULL,
        scaledBySkill: new Map<SkillType, number | null | undefined>([
          [SkillType.LISTENING, 300],
          [SkillType.READING, 250],
        ]),
      }),
    ).toBe(550);
  });
});
