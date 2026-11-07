import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Assessment } from '../../entities/assessment.entity.js';
import { AttemptSection } from '../../entities/attempt-section.entity.js';
import { Attempt } from '../../entities/attempt.entity.js';
import { TestPart } from '../../entities/test-part.entity.js';
import { Test } from '../../entities/test.entity.js';
import { MediaModule } from '../media/media.module.js';
import { StudentAttemptsModule } from '../student-attempts/student-attempts.module.js';
import { AttemptsQueryService } from './attempts-query.service.js';
import { AttemptsController } from './attempts.controller.js';
import { GradingQueryService } from './grading-query.service.js';
import { GradingController } from './grading.controller.js';
import { GradingService } from './grading.service.js';

@Module({
  controllers: [GradingController, AttemptsController],
  providers: [GradingService, GradingQueryService, AttemptsQueryService],
  imports: [
    TypeOrmModule.forFeature([
      Assessment,
      Attempt,
      AttemptSection,
      TestPart,
      Test,
    ]),
    MediaModule,
    StudentAttemptsModule,
  ],
})
export class GradingModule {}
