import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TestPart } from '../../entities/test-part.entity.js';
import { Test } from '../../entities/test.entity.js';
import { MediaValidatorModule } from '../../shared/media/media-validator.module.js';
import { TestsModule } from '../tests/tests.module.js';
import { TestPartsController } from './test-parts.controller.js';
import { TestPartsService } from './test-parts.service.js';

@Module({
  controllers: [TestPartsController],
  providers: [TestPartsService],
  exports: [TestPartsService],
  imports: [
    TypeOrmModule.forFeature([TestPart, Test]),
    TestsModule,
    MediaValidatorModule,
  ],
})
export class TestPartsModule {}
