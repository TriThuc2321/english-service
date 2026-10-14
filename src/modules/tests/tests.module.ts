import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TestSection } from '../../entities/test-section.entity.js';
import { Test } from '../../entities/test.entity.js';
import { MediaModule } from '../media/media.module.js';
import { TestMediaPolicy } from './test-media.policy.js';
import { TestsController } from './tests.controller.js';
import { TestsService } from './tests.service.js';

@Module({
  controllers: [TestsController],
  providers: [TestsService, TestMediaPolicy],
  exports: [TestsService],
  imports: [TypeOrmModule.forFeature([Test, TestSection]), MediaModule],
})
export class TestsModule {}
