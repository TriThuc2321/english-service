import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { QuestionGroup } from '../../entities/question-group.entity.js';
import { Question } from '../../entities/question.entity.js';
import { MediaModule } from '../media/media.module.js';
import { PassagesModule } from '../passages/passages.module.js';
import { TestPartsModule } from '../test-parts/test-parts.module.js';
import { TestsModule } from '../tests/tests.module.js';
import { QuestionGroupsController } from './question-groups.controller.js';
import { QuestionGroupsService } from './question-groups.service.js';

@Module({
  controllers: [QuestionGroupsController],
  providers: [QuestionGroupsService],
  exports: [QuestionGroupsService],
  imports: [
    TypeOrmModule.forFeature([QuestionGroup, Question]),
    TestsModule,
    TestPartsModule,
    MediaModule,
    PassagesModule,
  ],
})
export class QuestionGroupsModule {}
