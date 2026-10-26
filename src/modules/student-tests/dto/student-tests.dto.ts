import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';
import { ExamType } from '../../../types/test.type.js';

export class ListStudentTestsDto extends PageOptionsDto {
  @ApiPropertyOptional({ description: 'Matches title or source' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly search?: string;

  @ApiPropertyOptional({ enum: ExamType, enumName: 'ExamType' })
  @IsOptional()
  @IsEnum(ExamType)
  readonly examType?: ExamType;
}
