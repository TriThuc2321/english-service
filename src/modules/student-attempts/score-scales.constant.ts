import { ExamType, SkillType } from '../../types/test.type.js';

export interface IScaleRow {
  examType: ExamType;
  skill: SkillType;
  rawScore: number;
  scaledScore: number;
}

type Range = [from: number, to: number, scaled: number];
type Anchor = [raw: number, scaled: number];

const fromRanges = (ranges: Range[]): Array<[number, number]> =>
  ranges.flatMap(([from, to, scaled]) =>
    Array.from({ length: to - from + 1 }, (_, i): [number, number] => [
      from + i,
      scaled,
    ]),
  );

const fromAnchors = (anchors: Anchor[]): Array<[number, number]> => {
  const rows: Array<[number, number]> = [];
  for (let raw = 0; raw <= 100; raw++) {
    const next = anchors.findIndex(([r]) => r >= raw);
    const [r1, s1] = anchors[next];
    const [r0, s0] = next > 0 && r1 !== raw ? anchors[next - 1] : [r1, s1];
    const value = r1 === r0 ? s1 : s0 + ((s1 - s0) * (raw - r0)) / (r1 - r0);
    rows.push([raw, Math.min(495, Math.max(5, Math.round(value / 5) * 5))]);
  }
  return rows;
};

const IELTS_LISTENING = fromRanges([
  [39, 40, 9],
  [37, 38, 8.5],
  [35, 36, 8],
  [32, 34, 7.5],
  [30, 31, 7],
  [26, 29, 6.5],
  [23, 25, 6],
  [18, 22, 5.5],
  [16, 17, 5],
  [13, 15, 4.5],
  [10, 12, 4],
  [8, 9, 3.5],
  [6, 7, 3],
  [4, 5, 2.5],
  [2, 3, 2],
  [1, 1, 1],
  [0, 0, 0],
]);

const IELTS_ACADEMIC_READING = fromRanges([
  [39, 40, 9],
  [37, 38, 8.5],
  [35, 36, 8],
  [33, 34, 7.5],
  [30, 32, 7],
  [27, 29, 6.5],
  [23, 26, 6],
  [19, 22, 5.5],
  [15, 18, 5],
  [13, 14, 4.5],
  [10, 12, 4],
  [8, 9, 3.5],
  [6, 7, 3],
  [4, 5, 2.5],
  [2, 3, 2],
  [1, 1, 1],
  [0, 0, 0],
]);

const IELTS_GENERAL_READING = fromRanges([
  [40, 40, 9],
  [39, 39, 8.5],
  [37, 38, 8],
  [36, 36, 7.5],
  [34, 35, 7],
  [32, 33, 6.5],
  [30, 31, 6],
  [27, 29, 5.5],
  [23, 26, 5],
  [19, 22, 4.5],
  [15, 18, 4],
  [12, 14, 3.5],
  [9, 11, 3],
  [6, 8, 2.5],
  [4, 5, 2],
  [1, 3, 1],
  [0, 0, 0],
]);

// Commonly circulated approximations; ETS publishes no official TOEIC table.
const TOEIC_LISTENING = fromAnchors([
  [0, 5],
  [10, 40],
  [20, 95],
  [30, 145],
  [40, 195],
  [50, 250],
  [60, 305],
  [70, 360],
  [80, 410],
  [90, 465],
  [96, 495],
  [100, 495],
]);

const TOEIC_READING = fromAnchors([
  [0, 5],
  [10, 30],
  [20, 75],
  [30, 125],
  [40, 175],
  [50, 225],
  [60, 280],
  [70, 335],
  [80, 390],
  [90, 445],
  [100, 495],
]);

const toRows = (
  examType: ExamType,
  skill: SkillType,
  table: Array<[number, number]>,
): IScaleRow[] =>
  table.map(([rawScore, scaledScore]) => ({
    examType,
    skill,
    rawScore,
    scaledScore,
  }));

export const DEFAULT_SCORE_SCALES: IScaleRow[] = [
  ...toRows(ExamType.IELTS_ACADEMIC, SkillType.LISTENING, IELTS_LISTENING),
  ...toRows(ExamType.IELTS_GENERAL, SkillType.LISTENING, IELTS_LISTENING),
  ...toRows(ExamType.IELTS_ACADEMIC, SkillType.READING, IELTS_ACADEMIC_READING),
  ...toRows(ExamType.IELTS_GENERAL, SkillType.READING, IELTS_GENERAL_READING),
  ...toRows(ExamType.TOEIC_LR, SkillType.LISTENING, TOEIC_LISTENING),
  ...toRows(ExamType.TOEIC_LR, SkillType.READING, TOEIC_READING),
];
