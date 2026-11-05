import { AttemptMode } from '../../types/attempt.type.js';
import { EXAM_SKILLS, ExamType, SkillType } from '../../types/test.type.js';

// Half-band rounding up for task and section bands is this product's choice, not a published IELTS rule.
export function roundBand(value: number): number {
  return Math.floor(value * 2 + 0.5) / 2;
}

export function criteriaBand(scores: readonly number[]): number {
  return roundBand(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

export function writingBand(task1: number, task2: number): number {
  return roundBand((task1 + 2 * task2) / 3);
}

export function overallScoreOf(input: {
  examType: ExamType;
  mode: AttemptMode;
  scaledBySkill: ReadonlyMap<SkillType, number | null | undefined>;
}): number | null {
  const { examType, mode, scaledBySkill } = input;
  if (mode !== AttemptMode.FULL) return null;

  const present: number[] = [];
  for (const skill of EXAM_SKILLS[examType]) {
    const score = scaledBySkill.get(skill);
    if (score == null) return null;
    present.push(score);
  }

  switch (examType) {
    case ExamType.IELTS_ACADEMIC:
    case ExamType.IELTS_GENERAL:
      return criteriaBand(present);
    case ExamType.TOEIC_LR:
      return present.reduce((sum, s) => sum + s, 0);
    default:
      return null;
  }
}
