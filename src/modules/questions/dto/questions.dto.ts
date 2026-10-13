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
  ArrayUnique,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateQuestionDto {
  @ApiProperty()
  @IsInt()
  groupId: number;

  @ApiProperty({ example: 21, description: 'Displayed question number' })
  @IsInt()
  @Min(1)
  numberFrom: number;

  @ApiPropertyOptional({
    example: 22,
    description: 'Defaults to numberFrom; higher for "Choose TWO"',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  numberTo?: number;

  @ApiPropertyOptional({ description: 'Defaults to last position' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiPropertyOptional({
    description:
      'Shape depends on the group question type (see docs/question-formats.md): MCQ/TEXT_COMPLETION -> {"options":[{"key","text"}]}; PHOTO_DESCRIPTION/QUESTION_RESPONSE -> {"options":[{"key"}]}; Speaking/Writing -> {"prepSeconds"?,"responseSeconds"?}; other types take no content',
    example: {
      options: [
        { key: 'A', text: 'at the station' },
        { key: 'B', text: 'in the office' },
      ],
    },
  })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiProperty({
    description:
      'Shape depends on the group question type: {"key"} | {"keys"} | {"accepted"} | {"sample","rubric"?}',
    example: { key: 'B' },
  })
  @IsObject()
  answer: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ example: { paragraphId: 12, quote: '...' } })
  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'AUDIO media (TOEIC Part 1/2 clip)' })
  @IsOptional()
  @IsInt()
  audioMediaId?: number;

  @ApiPropertyOptional({ description: 'IMAGE media (TOEIC Part 1 photo)' })
  @IsOptional()
  @IsInt()
  imageMediaId?: number;

  @ApiPropertyOptional({ description: 'Review: jump to the answer in audio' })
  @IsOptional()
  @IsInt()
  @Min(0)
  audioStartMs?: number;
}

export class QuestionInputDto extends OmitType(CreateQuestionDto, [
  'groupId',
] as const) {}

export class UpdateQuestionDto extends PartialType(QuestionInputDto) {}

export class ListQuestionsDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  readonly groupId: number;
}

export class ReorderQuestionsDto {
  @ApiProperty()
  @IsInt()
  groupId: number;

  @ApiProperty({ type: [Number], description: 'Question ids in new order' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}

export class DeleteQuestionsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}
