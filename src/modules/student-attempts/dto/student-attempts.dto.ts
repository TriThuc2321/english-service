import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';
import { AttemptMode, AttemptStatus } from '../../../types/attempt.type.js';

export class StartAttemptDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  readonly testId: number;

  @ApiProperty({ enum: AttemptMode, enumName: 'AttemptMode' })
  @IsEnum(AttemptMode)
  readonly mode: AttemptMode;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Required when mode is SECTION; test_sections ids',
  })
  @ValidateIf((o: StartAttemptDto) => o.mode === AttemptMode.SECTION)
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  readonly sectionIds?: number[];
}

export class ListAttemptsDto extends PageOptionsDto {
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
}

export class SaveAnswerItemDto {
  @ApiProperty()
  @IsInt()
  readonly questionId: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: '{ key } | { keys } | { text }; null clears the answer',
  })
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  readonly response: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Omit to keep the stored value' })
  @IsOptional()
  @IsBoolean()
  readonly flagged?: boolean;
}

export class SaveAnswersDto {
  @ApiProperty({ type: [SaveAnswerItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SaveAnswerItemDto)
  readonly answers: SaveAnswerItemDto[];
}
