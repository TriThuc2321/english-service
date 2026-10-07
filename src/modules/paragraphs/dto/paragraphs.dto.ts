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
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';

export class CreateParagraphDto {
  @ApiProperty()
  @IsInt()
  passageId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Content is required' })
  content: string;

  @ApiPropertyOptional({ description: 'Defaults to last position' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateParagraphDto extends PartialType(
  OmitType(CreateParagraphDto, ['passageId'] as const),
) {}

export class ListParagraphsDto extends PageOptionsDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  readonly passageId: number;
}

export class ReorderParagraphsDto {
  @ApiProperty()
  @IsInt()
  passageId: number;

  @ApiProperty({ type: [Number], description: 'Paragraph ids in new order' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}

export class DeleteParagraphsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}
