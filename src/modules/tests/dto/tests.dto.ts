import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';
import { ExamType, SkillType, TestStatus } from '../../../types/test.type.js';

const EDITABLE_STATUSES = [TestStatus.PUBLISHED, TestStatus.DRAFT] as const;

export class TestSectionInputDto {
  @ApiProperty({ enum: SkillType })
  @IsEnum(SkillType)
  skill: SkillType;

  @ApiPropertyOptional({ description: 'Defaults to array index' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ description: 'IELTS: per-section limit' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}

export class CreateTestDto {
  @ApiProperty({ enum: ExamType })
  @IsEnum(ExamType)
  examType: ExamType;

  @ApiProperty({ example: 'Cambridge IELTS 18 - Test 1' })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'Cambridge 18' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;

  @ApiPropertyOptional({ description: 'Overall limit (TOEIC LR = 120)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({ type: [TestSectionInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.values(SkillType).length)
  @ValidateNested({ each: true })
  @Type(() => TestSectionInputDto)
  sections?: TestSectionInputDto[];
}

export class UpdateTestDto extends PartialType(
  OmitType(CreateTestDto, ['sections'] as const),
) {
  @ApiPropertyOptional({ enum: EDITABLE_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  status?: TestStatus.PUBLISHED | TestStatus.DRAFT;
}

export class ListTestsDto extends PageOptionsDto {
  @ApiPropertyOptional({ description: 'Matches title or source' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly search?: string;

  @ApiPropertyOptional({ enum: EDITABLE_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  readonly status?: TestStatus.PUBLISHED | TestStatus.DRAFT;

  @ApiPropertyOptional({ enum: ExamType })
  @IsOptional()
  @IsEnum(ExamType)
  readonly examType?: ExamType;
}

export class DeleteTestsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}
