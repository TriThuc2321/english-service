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
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTestPartDto {
  @ApiProperty()
  @IsInt()
  sectionId: number;

  @ApiPropertyOptional({ description: 'Defaults to last position' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ example: 'Part 1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiPropertyOptional({ description: 'AUDIO media for the whole part' })
  @IsOptional()
  @IsInt()
  audioMediaId?: number;

  @ApiPropertyOptional({ description: 'When several parts share one audio' })
  @IsOptional()
  @IsInt()
  @Min(0)
  audioStartMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  audioEndMs?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Passage shared by every group of the part (IELTS Reading); groups with their own passages override it',
  })
  @IsOptional()
  @IsInt()
  passageId?: number | null;
}

export class UpdateTestPartDto extends PartialType(
  OmitType(CreateTestPartDto, ['sectionId'] as const),
) {}

export class ListTestPartsDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  readonly sectionId: number;
}

export class ReorderTestPartsDto {
  @ApiProperty()
  @IsInt()
  sectionId: number;

  @ApiProperty({ type: [Number], description: 'Part ids in new order' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}

export class DeleteTestPartsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}
