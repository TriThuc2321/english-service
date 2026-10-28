import { ExamType, SkillType } from '../../types/test.type.js';
import { DEFAULT_SCORE_SCALES } from './score-scales.constant.js';

const rowsOf = (examType: ExamType, skill: SkillType) =>
  DEFAULT_SCORE_SCALES.filter(
    (r) => r.examType === examType && r.skill === skill,
  ).sort((a, b) => a.rawScore - b.rawScore);

const scaled = (examType: ExamType, skill: SkillType, raw: number) =>
  rowsOf(examType, skill).find((r) => r.rawScore === raw)?.scaledScore;

describe('DEFAULT_SCORE_SCALES', () => {
  const cases: [ExamType, SkillType, number][] = [
    [ExamType.IELTS_ACADEMIC, SkillType.LISTENING, 40],
    [ExamType.IELTS_ACADEMIC, SkillType.READING, 40],
    [ExamType.IELTS_GENERAL, SkillType.LISTENING, 40],
    [ExamType.IELTS_GENERAL, SkillType.READING, 40],
    [ExamType.TOEIC_LR, SkillType.LISTENING, 100],
    [ExamType.TOEIC_LR, SkillType.READING, 100],
  ];

  it.each(cases)(
    '%s %s covers every raw score once and never decreases',
    (exam, skill, max) => {
      const rows = rowsOf(exam, skill);
      expect(rows.map((r) => r.rawScore)).toEqual(
        Array.from({ length: max + 1 }, (_, i) => i),
      );
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].scaledScore).toBeGreaterThanOrEqual(
          rows[i - 1].scaledScore,
        );
      }
    },
  );

  it('matches spot checks', () => {
    expect(scaled(ExamType.IELTS_ACADEMIC, SkillType.LISTENING, 30)).toBe(7);
    expect(scaled(ExamType.IELTS_GENERAL, SkillType.READING, 30)).toBe(6);
    expect(scaled(ExamType.TOEIC_LR, SkillType.LISTENING, 100)).toBe(495);
    expect(scaled(ExamType.TOEIC_LR, SkillType.LISTENING, 0)).toBe(5);
    expect(scaled(ExamType.TOEIC_LR, SkillType.READING, 50)).toBe(225);
  });
});
