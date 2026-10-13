import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Media } from '../../entities/media.entity.js';
import { MediaValidator } from './media.validator.js';

@Module({
  providers: [MediaValidator],
  exports: [MediaValidator],
  imports: [TypeOrmModule.forFeature([Media])],
})
export class MediaValidatorModule {}
