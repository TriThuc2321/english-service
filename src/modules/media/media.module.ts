import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Media } from '../../entities/media.entity.js';
import { StorageModule } from '../../shared/storage/storage.module.js';
import { TestsModule } from '../tests/tests.module.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

@Module({
  controllers: [MediaController],
  providers: [MediaService],
  imports: [TypeOrmModule.forFeature([Media]), StorageModule, TestsModule],
})
export class MediaModule {}
