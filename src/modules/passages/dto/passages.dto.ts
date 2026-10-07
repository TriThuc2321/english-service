import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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

import { MarkedBy } from '../../../entities/passage.entity.js';
import { PageOptionsDto } from '../../../shared/dto/index.js';
import { Status } from '../../../types/common.type.js';

const EDITABLE_STATUSES = [Status.ACTIVE, Status.INACTIVE] as const;

export class ParagraphInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Content is required' })
  content: string;

  @ApiPropertyOptional({ description: 'Defaults to array index' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreatePassageDto {
  @ApiProperty({ example: 'The Solar System' })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subtitle?: string;

  @ApiPropertyOptional({ enum: MarkedBy, default: MarkedBy.NONE })
  @IsOptional()
  @IsEnum(MarkedBy)
  markedBy?: MarkedBy;

  @ApiPropertyOptional({ type: [ParagraphInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ParagraphInputDto)
  paragraphs?: ParagraphInputDto[];
}

export class UpdatePassageDto extends PartialType(CreatePassageDto) {
  @ApiPropertyOptional({ enum: EDITABLE_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  status?: Status.ACTIVE | Status.INACTIVE;
}

export class ListPassagesDto extends PageOptionsDto {
  @ApiPropertyOptional({ description: 'Matches title or subtitle' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly search?: string;

  @ApiPropertyOptional({ enum: EDITABLE_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  readonly status?: Status.ACTIVE | Status.INACTIVE;

  @ApiPropertyOptional({ enum: MarkedBy })
  @IsOptional()
  @IsEnum(MarkedBy)
  readonly markedBy?: MarkedBy;
}

export class DeletePassagesDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}
