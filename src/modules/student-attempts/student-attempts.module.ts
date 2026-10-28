import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttemptAnswer } from '../../entities/attempt-answer.entity.js';
import { AttemptSection } from '../../entities/attempt-section.entity.js';
import { Attempt } from '../../entities/attempt.entity.js';
import { Media } from '../../entities/media.entity.js';
import { Question } from '../../entities/question.entity.js';
import { ScoreScale } from '../../entities/score-scale.entity.js';
import { Test } from '../../entities/test.entity.js';
import { ScoreScalesSeeder } from './score-scales.seeder.js';

@Module({
  providers: [ScoreScalesSeeder],
  imports: [
    TypeOrmModule.forFeature([
      Attempt,
      AttemptSection,
      AttemptAnswer,
      ScoreScale,
      Test,
      Question,
      Media,
    ]),
  ],
})
export class StudentAttemptsModule {}
