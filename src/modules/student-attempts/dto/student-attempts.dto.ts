import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';
import { AttemptMode, AttemptStatus } from '../../../types/attempt.type.js';
import { MediaKind } from '../../../types/media.type.js';
import {
  MEDIA_KEY_PATTERN,
  MEDIA_MIME_EXTENSIONS,
} from '../../media/media.constant.js';
import { ATTEMPT_AUDIO_MAX_BYTES } from '../attempt-media.policy.js';

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
    description:
      '{ key } | { keys } | { text } (an essay for Writing, up to 20,000 characters); null clears the answer. Speaking questions are refused: record through the audio endpoints',
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

export class CreateAttemptAudioUploadDto {
  @ApiProperty({ description: 'A Speaking question of the open section' })
  @IsInt()
  readonly questionId: number;

  @ApiProperty({ example: 'audio/webm' })
  @IsIn(Object.keys(MEDIA_MIME_EXTENSIONS[MediaKind.AUDIO]))
  readonly contentType: string;

  @ApiProperty({ description: 'Bytes, at most 20 MB' })
  @IsInt()
  @Min(1)
  @Max(ATTEMPT_AUDIO_MAX_BYTES)
  readonly size: number;
}

export class ConfirmAttemptAudioDto {
  @ApiProperty()
  @IsInt()
  readonly questionId: number;

  @ApiProperty({ description: 'The storageKey returned by upload-url' })
  @IsString()
  @Matches(MEDIA_KEY_PATTERN)
  readonly storageKey: string;
}
