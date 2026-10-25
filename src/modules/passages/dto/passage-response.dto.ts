import { ApiProperty } from '@nestjs/swagger';

import { MarkedBy, PassageStatus } from '../../../entities/passage.entity.js';
import { AuditMetadataWithActorsDto } from '../../../shared/dto/index.js';
import { ParagraphDto } from '../../paragraphs/dto/paragraph-response.dto.js';

export class PassageListItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  subtitle: string | null;

  @ApiProperty({ enum: MarkedBy, enumName: 'MarkedBy' })
  markedBy: MarkedBy;

  @ApiProperty({ enum: PassageStatus, enumName: 'PassageStatus' })
  status: PassageStatus;

  @ApiProperty({ type: AuditMetadataWithActorsDto })
  auditMetadata: AuditMetadataWithActorsDto;
}

export class PassageDetailDto extends PassageListItemDto {
  @ApiProperty({ type: [ParagraphDto] })
  paragraphs: ParagraphDto[];
}
