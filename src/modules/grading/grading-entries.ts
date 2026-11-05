import { BadRequestException } from '@nestjs/common';

import type {
  IAssessmentDetails,
  IAssessmentEntry,
} from '../../types/attempt.type.js';

import { criteriaBand, writingBand } from '../../shared/scoring/ielts-band.js';
import { QuestionType, SkillType } from '../../types/test.type.js';

export interface IExpectedEntry {
  partId: number | null;
  task: 1 | 2 | null;
  criteria: readonly string[];
}

export interface IEntryInput {
  partId: number | null;
  criteria: Record<string, number>;
  feedback?: string;
}

const TASK_1_CRITERIA = ['TA', 'CC', 'LR', 'GRA'];
const TASK_2_CRITERIA = ['TR', 'CC', 'LR', 'GRA'];
const SPEAKING_CRITERIA = ['FC', 'LR', 'GRA', 'P'];

export function expectedEntriesOf(
  skill: SkillType,
  questions: ReadonlyArray<{ partId: number; questionType: QuestionType }>,
): IExpectedEntry[] {
  if (skill === SkillType.SPEAKING) {
    return [{ partId: null, task: null, criteria: SPEAKING_CRITERIA }];
  }
  return questions.flatMap((q): IExpectedEntry[] => {
    if (q.questionType === QuestionType.IELTS_WRITING_TASK_1) {
      return [{ partId: q.partId, task: 1, criteria: TASK_1_CRITERIA }];
    }
    if (q.questionType === QuestionType.IELTS_WRITING_TASK_2) {
      return [{ partId: q.partId, task: 2, criteria: TASK_2_CRITERIA }];
    }
    return [];
  });
}

const isScore = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= 0 &&
  v <= 9 &&
  Number.isInteger(v * 2);

const nameOf = (partId: number | null) =>
  partId === null ? 'the Speaking entry' : `part ${partId}`;

const invalid = (name: string, message: string) =>
  new BadRequestException(`${name}: ${message}`);

function bandOf(expected: IExpectedEntry, entry: IEntryInput): number {
  const name = nameOf(expected.partId);
  const criteria = entry.criteria ?? {};
  const extra = Object.keys(criteria).filter(
    (code) => !expected.criteria.includes(code),
  );
  if (extra.length) {
    throw invalid(name, `unexpected criteria ${extra.join(', ')}`);
  }
  const scores = expected.criteria.map((code) => {
    const score: unknown = criteria[code];
    if (score === undefined) throw invalid(name, `missing criterion ${code}`);
    if (!isScore(score)) {
      throw invalid(name, `${code} must be 0 to 9 in steps of 0.5`);
    }
    return score;
  });
  return criteriaBand(scores);
}

export function computeAssessment(
  skill: SkillType,
  expected: readonly IExpectedEntry[],
  entries: readonly IEntryInput[],
): { band: number; details: IAssessmentDetails } {
  const byPart = new Map<number | null, IEntryInput>();
  for (const entry of entries) {
    const partId = entry.partId ?? null;
    const name = nameOf(partId);
    if (!expected.some((e) => e.partId === partId)) {
      throw invalid(name, 'does not belong to this section');
    }
    if (byPart.has(partId)) throw invalid(name, 'appears more than once');
    byPart.set(partId, entry);
  }

  const graded: IAssessmentEntry[] = expected.map((e) => {
    const entry = byPart.get(e.partId);
    if (!entry) throw invalid(nameOf(e.partId), 'is missing');
    return {
      partId: e.partId,
      criteria: Object.fromEntries(
        e.criteria.map((code) => [code, entry.criteria[code]]),
      ),
      band: bandOf(e, entry),
      feedback: entry.feedback ?? null,
    };
  });

  const band =
    skill === SkillType.WRITING
      ? writingBand(
          graded[expected.findIndex((e) => e.task === 1)].band,
          graded[expected.findIndex((e) => e.task === 2)].band,
        )
      : graded[0].band;
  return { band, details: { entries: graded } };
}
