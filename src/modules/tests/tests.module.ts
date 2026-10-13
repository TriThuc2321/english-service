import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Passage } from '../../entities/passage.entity.js';
import { TestSection } from '../../entities/test-section.entity.js';
import { Test } from '../../entities/test.entity.js';
import { TestsController } from './tests.controller.js';
import { TestsService } from './tests.service.js';

@Module({
  controllers: [TestsController],
  providers: [TestsService],
  exports: [TestsService],
  imports: [TypeOrmModule.forFeature([Test, TestSection, Passage])],
})
export class TestsModule {}
