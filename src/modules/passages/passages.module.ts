import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Paragraph } from '../../entities/paragraph.entity.js';
import { Passage } from '../../entities/passage.entity.js';
import { PassagesController } from './passages.controller.js';
import { PassagesService } from './passages.service.js';

@Module({
  controllers: [PassagesController],
  providers: [PassagesService],
  exports: [PassagesService],
  imports: [TypeOrmModule.forFeature([Passage, Paragraph])],
})
export class PassagesModule {}
