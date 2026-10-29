import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttemptAnswer } from '../../entities/attempt-answer.entity.js';
import { AttemptSection } from '../../entities/attempt-section.entity.js';
import { Attempt } from '../../entities/attempt.entity.js';
import { Media } from '../../entities/media.entity.js';
import { Question } from '../../entities/question.entity.js';
import { ScoreScale } from '../../entities/score-scale.entity.js';
import { Test } from '../../entities/test.entity.js';
import { AttemptResultService } from './attempt-result.service.js';
import { AttemptScoringService } from './attempt-scoring.service.js';
import { AttemptTreeService } from './attempt-tree.service.js';
import { ScoreScalesSeeder } from './score-scales.seeder.js';
import { StudentAttemptsController } from './student-attempts.controller.js';
import { StudentAttemptsService } from './student-attempts.service.js';

@Module({
  controllers: [StudentAttemptsController],
  providers: [
    ScoreScalesSeeder,
    AttemptTreeService,
    AttemptScoringService,
    AttemptResultService,
    StudentAttemptsService,
  ],
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
