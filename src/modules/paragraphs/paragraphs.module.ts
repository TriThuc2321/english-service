import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Paragraph } from '../../entities/paragraph.entity.js';
import { Passage } from '../../entities/passage.entity.js';
import { ParagraphsController } from './paragraphs.controller.js';
import { ParagraphsService } from './paragraphs.service.js';

@Module({
  controllers: [ParagraphsController],
  providers: [ParagraphsService],
  exports: [ParagraphsService],
  imports: [TypeOrmModule.forFeature([Paragraph, Passage])],
})
export class ParagraphsModule {}
