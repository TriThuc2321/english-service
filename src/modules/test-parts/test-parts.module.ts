import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TestPart } from '../../entities/test-part.entity.js';
import { Test } from '../../entities/test.entity.js';
import { MediaModule } from '../media/media.module.js';
import { PassagesModule } from '../passages/passages.module.js';
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
    MediaModule,
    PassagesModule,
  ],
})
export class TestPartsModule {}
