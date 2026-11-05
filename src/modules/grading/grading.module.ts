import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Assessment } from '../../entities/assessment.entity.js';
import { AttemptSection } from '../../entities/attempt-section.entity.js';
import { Attempt } from '../../entities/attempt.entity.js';
import { TestPart } from '../../entities/test-part.entity.js';
import { Test } from '../../entities/test.entity.js';
import { GradingController } from './grading.controller.js';
import { GradingService } from './grading.service.js';

@Module({
  controllers: [GradingController],
  providers: [GradingService],
  imports: [
    TypeOrmModule.forFeature([
      Assessment,
      Attempt,
      AttemptSection,
      TestPart,
      Test,
    ]),
  ],
})
export class GradingModule {}
