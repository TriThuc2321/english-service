import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TestSection } from '../../entities/test-section.entity.js';
import { TestsModule } from '../tests/tests.module.js';
import { TestSectionsController } from './test-sections.controller.js';
import { TestSectionsService } from './test-sections.service.js';

@Module({
  controllers: [TestSectionsController],
  providers: [TestSectionsService],
  exports: [TestSectionsService],
  imports: [TypeOrmModule.forFeature([TestSection]), TestsModule],
})
export class TestSectionsModule {}
