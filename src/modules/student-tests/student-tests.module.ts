import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Media } from '../../entities/media.entity.js';
import { Passage } from '../../entities/passage.entity.js';
import { Test } from '../../entities/test.entity.js';
import { StorageModule } from '../../shared/storage/storage.module.js';
import { StudentTestsController } from './student-tests.controller.js';
import { StudentTestsService } from './student-tests.service.js';

@Module({
  controllers: [StudentTestsController],
  providers: [StudentTestsService],
  imports: [TypeOrmModule.forFeature([Test, Passage, Media]), StorageModule],
})
export class StudentTestsModule {}
