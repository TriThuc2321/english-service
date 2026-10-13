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
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { QuestionType } from '../../../types/test.type.js';
import { QuestionInputDto } from '../../questions/dto/questions.dto.js';

export class CreateQuestionGroupDto {
  @ApiProperty()
  @IsInt()
  partId: number;

  @ApiPropertyOptional({ description: 'Defaults to last position' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType)
  questionType: QuestionType;

  @ApiPropertyOptional({
    example: 'Questions 1-6: Do the following statements agree...',
  })
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiPropertyOptional({ description: '"NO MORE THAN TWO WORDS" -> 2' })
  @IsOptional()
  @IsInt()
  @Min(1)
  wordLimit?: number;

  @ApiPropertyOptional({
    description:
      'Shape depends on questionType (see docs/question-formats.md): matching -> {"options","allowReuse"?}; form/note/flow-chart/sentence -> {"template"}; summary -> {"template","options"?}; table -> {"table":{"headers"?,"rows"}}; map/plan -> {"options"}; RESPOND_USING_INFO -> {"info"}; other types take no content',
    example: {
      options: [
        { key: 'i', text: 'The history of the region' },
        { key: 'ii', text: 'A new approach to farming' },
      ],
      allowReuse: false,
    },
  })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'AUDIO media (TOEIC Part 3/4)' })
  @IsOptional()
  @IsInt()
  audioMediaId?: number;

  @ApiPropertyOptional({ description: 'IMAGE media (graphic, map, diagram)' })
  @IsOptional()
  @IsInt()
  imageMediaId?: number;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Linked passages in display order (TOEIC Part 7: up to 3)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  passageIds?: number[];

  @ApiPropertyOptional({ type: [QuestionInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuestionInputDto)
  questions?: QuestionInputDto[];
}

export class UpdateQuestionGroupDto extends PartialType(
  OmitType(CreateQuestionGroupDto, ['partId', 'questions'] as const),
) {}

export class ListQuestionGroupsDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  readonly partId: number;
}

export class ReorderQuestionGroupsDto {
  @ApiProperty()
  @IsInt()
  partId: number;

  @ApiProperty({ type: [Number], description: 'Group ids in new order' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}

export class DeleteQuestionGroupsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}
