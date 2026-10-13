import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Question } from '../../entities/question.entity.js';
import { MediaValidatorModule } from '../../shared/media/media-validator.module.js';
import { QuestionGroupsModule } from '../question-groups/question-groups.module.js';
import { TestsModule } from '../tests/tests.module.js';
import { QuestionsController } from './questions.controller.js';
import { QuestionsService } from './questions.service.js';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService],
  imports: [
    TypeOrmModule.forFeature([Question]),
    TestsModule,
    QuestionGroupsModule,
    MediaValidatorModule,
  ],
})
export class QuestionsModule {}
