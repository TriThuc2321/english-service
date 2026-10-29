import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { Test } from '../../entities/test.entity.js';
import { QuestionType, SkillType } from '../../types/test.type.js';
import { answerKeysOf } from '../questions/answer-text.js';

export interface ITreeQuestion {
  id: number;
  sectionId: number;
  questionType: QuestionType;
  wordLimit: number | null;
  numberFrom: number;
  numberTo: number;
  keys: ReadonlySet<string> | null;
}

export interface ITreeSection {
  sectionId: number;
  skill: SkillType;
  order: number;
  durationMinutes: number | null;
}

export interface IAttemptTree {
  testId: number;
  sections: ITreeSection[];
  questions: ReadonlyMap<number, ITreeQuestion>;
  mediaIds: ReadonlyMap<number, number[]>;
}

const GRADED_SKILLS = [SkillType.LISTENING, SkillType.READING];

@Injectable()
export class AttemptTreeService {
  private readonly cache = new Map<number, IAttemptTree>();

  constructor(private readonly dataSource: DataSource) {}

  // Inside a transaction pass its manager: a second pool connection per request can exhaust the pool
  async get(testId: number, manager?: EntityManager): Promise<IAttemptTree> {
    const cached = this.cache.get(testId);
    if (cached) {
      return cached;
    }

    const test = await (manager ?? this.dataSource.manager)
      .createQueryBuilder(Test, 't')
      .leftJoin('t.testSections', 's', 's.skill IN (:...skills)', {
        skills: GRADED_SKILLS,
      })
      .leftJoin('s.testParts', 'p')
      .leftJoin('p.questionGroups', 'g')
      .leftJoin('g.questions', 'q')
      .select([
        't.id',
        't.lockedAt',
        's.id',
        's.skill',
        's.order',
        's.durationMinutes',
        'p.id',
        'p.audioMediaId',
        'g.id',
        'g.questionType',
        'g.wordLimit',
        'g.content',
        'g.audioMediaId',
        'q.id',
        'q.numberFrom',
        'q.numberTo',
        'q.content',
        'q.audioMediaId',
      ])
      .where('t.id = :testId', { testId })
      .orderBy('s.order', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .addOrderBy('p.order', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .addOrderBy('g.order', 'ASC')
      .addOrderBy('g.id', 'ASC')
      .addOrderBy('q.order', 'ASC')
      .addOrderBy('q.id', 'ASC')
      .getOne();
    if (!test) {
      throw new NotFoundException(`Test ${testId} not found`);
    }

    const questions = new Map<number, ITreeQuestion>();
    const mediaIds = new Map<number, number[]>();
    const sections: ITreeSection[] = [];

    for (const s of test.testSections) {
      sections.push({
        sectionId: s.id,
        skill: s.skill,
        order: s.order,
        durationMinutes: s.durationMinutes ?? null,
      });
      const media = new Set<number>();
      const add = (id?: number | null) => {
        if (id != null) {
          media.add(id);
        }
      };

      for (const p of s.testParts) {
        add(p.audioMediaId);
        for (const g of p.questionGroups) {
          add(g.audioMediaId);
          for (const q of g.questions) {
            add(q.audioMediaId);
            questions.set(q.id, {
              id: q.id,
              sectionId: s.id,
              questionType: g.questionType,
              wordLimit: g.wordLimit ?? null,
              numberFrom: q.numberFrom,
              numberTo: q.numberTo,
              keys: answerKeysOf(g.questionType, g.content, q.content),
            });
          }
        }
      }
      mediaIds.set(s.id, [...media]);
    }

    const tree: IAttemptTree = { testId, sections, questions, mediaIds };
    if (test.lockedAt) {
      this.cache.set(testId, tree);
    }
    return tree;
  }
}
