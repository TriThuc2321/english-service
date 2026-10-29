import { Module } from '@nestjs/common';

import { TestsModule } from '../tests/tests.module.js';
import { TestImportController } from './test-import.controller.js';
import { TestImportService } from './test-import.service.js';

@Module({
  controllers: [TestImportController],
  providers: [TestImportService],
  imports: [TestsModule],
})
export class TestImportModule {}
