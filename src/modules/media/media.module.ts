import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Media } from '../../entities/media.entity.js';
import { StorageModule } from '../../shared/storage/storage.module.js';
import { LibraryMediaPolicy } from './library-media.policy.js';
import { MediaPolicyRegistry } from './media-policy.registry.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { MediaValidator } from './media.validator.js';

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaPolicyRegistry,
    MediaValidator,
    LibraryMediaPolicy,
  ],
  exports: [MediaService, MediaPolicyRegistry, MediaValidator],
  imports: [TypeOrmModule.forFeature([Media]), StorageModule],
})
export class MediaModule {}
