import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import type {
  IImportEvidence,
  IImportGroup,
  IImportPart,
  IImportPassage,
  IImportQuestion,
  IImportSection,
  ITestImport,
} from '../test-import.type.js';

import { MarkedBy } from '../../../entities/passage.entity.js';
import { QuestionType, SkillType } from '../../../types/test.type.js';
import { CreateTestDto } from '../../tests/dto/tests.dto.js';

export class ImportEvidenceDto implements IImportEvidence {
  @ApiPropertyOptional({
    example: 3,
    description: '1-based index into the paragraphs of the part passage',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  paragraph?: number;

  @ApiPropertyOptional({ description: 'Copied verbatim from the paragraph' })
  @IsOptional()
  @IsString()
  quote?: string;
}

export class ImportQuestionDto implements IImportQuestion {
  @ApiProperty({ example: 23 })
  @IsInt()
  @Min(1)
  numberFrom: number;

  @ApiPropertyOptional({
    example: 24,
    description: 'Defaults to numberFrom; higher for "Choose TWO"',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  numberTo?: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  prompt?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'See docs/question-formats.md',
  })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { keys: ['C', 'D'] },
    description: '{"key"} | {"keys"} | {"accepted"} | {"sample","rubric"?}',
  })
  @IsObject()
  answer: Record<string, unknown>;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  explanation?: string | null;

  @ApiPropertyOptional({ type: ImportEvidenceDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ImportEvidenceDto)
  evidence?: ImportEvidenceDto | null;
}

export class ImportGroupDto implements IImportGroup {
  @ApiProperty({ enum: QuestionType, enumName: 'QuestionType' })
  @IsEnum(QuestionType)
  questionType: QuestionType;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  instruction?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  wordLimit?: number | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'See docs/question-formats.md',
  })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown> | null;

  @ApiProperty({ type: [ImportQuestionDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportQuestionDto)
  questions: ImportQuestionDto[];
}

export class ImportPassageDto implements IImportPassage {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subtitle?: string | null;

  @ApiProperty({ enum: MarkedBy, enumName: 'MarkedBy' })
  @IsEnum(MarkedBy)
  markedBy: MarkedBy;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  paragraphs: string[];
}

export class ImportPartDto implements IImportPart {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  instruction?: string | null;

  @ApiPropertyOptional({
    type: ImportPassageDto,
    nullable: true,
    description: 'Created as a new DRAFT passage',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ImportPassageDto)
  passage?: ImportPassageDto | null;

  @ApiProperty({ type: [ImportGroupDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportGroupDto)
  groups: ImportGroupDto[];
}

export class ImportSectionDto implements IImportSection {
  @ApiProperty({ enum: SkillType, enumName: 'SkillType' })
  @IsEnum(SkillType)
  skill: SkillType;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number | null;

  @ApiProperty({ type: [ImportPartDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportPartDto)
  parts: ImportPartDto[];
}

export class ImportTestDto
  extends PickType(CreateTestDto, [
    'examType',
    'title',
    'slug',
    'source',
    'durationMinutes',
  ])
  implements ITestImport
{
  @ApiProperty({ type: [ImportSectionDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportSectionDto)
  sections: ImportSectionDto[];
}
