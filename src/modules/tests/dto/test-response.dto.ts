import { ApiProperty } from '@nestjs/swagger';

import { AuditMetadataWithActorsDto } from '../../../shared/dto/index.js';
import { ExamType, TestStatus } from '../../../types/test.type.js';
import { TestSectionDto } from '../../test-sections/dto/test-section-response.dto.js';

export class TestListItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: ExamType, enumName: 'ExamType' })
  examType: ExamType;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  source: string | null;

  @ApiProperty({ type: Number, nullable: true })
  durationMinutes: number | null;

  @ApiProperty({ enum: TestStatus, enumName: 'TestStatus' })
  status: TestStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Set on the first attempt; the structure is frozen after',
  })
  lockedAt: string | null;

  @ApiProperty({ type: AuditMetadataWithActorsDto })
  auditMetadata: AuditMetadataWithActorsDto;
}

export class TestDetailDto extends TestListItemDto {
  @ApiProperty({ type: [TestSectionDto] })
  testSections: TestSectionDto[];
}
