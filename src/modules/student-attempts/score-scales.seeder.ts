import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ScoreScale } from '../../entities/score-scale.entity.js';
import { DEFAULT_SCORE_SCALES } from './score-scales.constant.js';

@Injectable()
export class ScoreScalesSeeder implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (!this.dataSource.isInitialized) return;

    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(ScoreScale)
      .values(DEFAULT_SCORE_SCALES)
      .orUpdate(['scaled_score'], ['exam_type', 'skill', 'raw_score'], {
        indexPredicate: '"test_id" IS NULL',
      })
      .execute();
  }
}
