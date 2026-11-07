import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';
import { AttemptStatus } from '../../../types/attempt.type.js';
import { ExamType } from '../../../types/test.type.js';

export class ListAttemptsQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  readonly userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly testId?: number;

  @ApiPropertyOptional({ enum: AttemptStatus, enumName: 'AttemptStatus' })
  @IsOptional()
  @IsEnum(AttemptStatus)
  readonly status?: AttemptStatus;

  @ApiPropertyOptional({ enum: ExamType, enumName: 'ExamType' })
  @IsOptional()
  @IsEnum(ExamType)
  readonly examType?: ExamType;

  @ApiPropertyOptional({ description: 'Matches student email or name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly search?: string;
}
