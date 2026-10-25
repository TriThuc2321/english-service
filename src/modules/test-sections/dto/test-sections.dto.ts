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
  IsOptional,
  Min,
} from 'class-validator';

import { SkillType } from '../../../types/test.type.js';

export class CreateTestSectionDto {
  @ApiProperty()
  @IsInt()
  testId: number;

  @ApiProperty({ enum: SkillType, enumName: 'SkillType' })
  @IsEnum(SkillType)
  skill: SkillType;

  @ApiPropertyOptional({ description: 'Defaults to last position' })
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

export class UpdateTestSectionDto extends PartialType(
  OmitType(CreateTestSectionDto, ['testId'] as const),
) {}

export class ListTestSectionsDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  readonly testId: number;
}

export class ReorderTestSectionsDto {
  @ApiProperty()
  @IsInt()
  testId: number;

  @ApiProperty({ type: [Number], description: 'Section ids in new order' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(Object.values(SkillType).length)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}

export class DeleteTestSectionsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}
