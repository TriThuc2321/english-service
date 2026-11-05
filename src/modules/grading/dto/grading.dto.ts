import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';
import { SkillType } from '../../../types/test.type.js';

export class AssessmentEntryInputDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'test_parts id of the Writing task; omit for Speaking',
  })
  @IsOptional()
  @IsInt()
  readonly partId?: number | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description:
      'Criterion code to band, 0 to 9 in steps of 0.5 (Task 1: TA CC LR GRA, Task 2: TR CC LR GRA, Speaking: FC LR GRA P)',
  })
  @IsObject()
  readonly criteria: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  readonly feedback?: string;
}

export class CreateAssessmentDto {
  @ApiProperty({
    description: 'Latest revision the teacher saw; 0 for the first grade',
  })
  @IsInt()
  @Min(0)
  readonly expectedRevision: number;

  @ApiProperty({ type: [AssessmentEntryInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AssessmentEntryInputDto)
  readonly entries: AssessmentEntryInputDto[];
}

export enum GradingQueueStatus {
  PENDING = 'PENDING',
  GRADED = 'GRADED',
}

export class ListGradingQueueDto extends PageOptionsDto {
  @ApiPropertyOptional({
    enum: GradingQueueStatus,
    enumName: 'GradingQueueStatus',
    default: GradingQueueStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(GradingQueueStatus)
  readonly gradingStatus: GradingQueueStatus = GradingQueueStatus.PENDING;

  @ApiPropertyOptional({
    enum: [SkillType.WRITING, SkillType.SPEAKING],
    enumName: 'GradingSkill',
  })
  @IsOptional()
  @IsIn([SkillType.WRITING, SkillType.SPEAKING])
  readonly skill?: SkillType.WRITING | SkillType.SPEAKING;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  readonly testId?: number;

  @ApiPropertyOptional({ description: 'Matches student email or name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly search?: string;
}
