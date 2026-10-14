import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';
import { MediaKind } from '../../../types/test.type.js';
import { MEDIA_KEY_PATTERN, MEDIA_MIME_TYPES } from '../media.constant.js';

export class CreateUploadUrlDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  testId: number;

  @ApiProperty({ enum: MediaKind })
  @IsEnum(MediaKind)
  kind: MediaKind;

  @ApiProperty({ enum: MEDIA_MIME_TYPES, example: 'audio/mpeg' })
  @IsIn(MEDIA_MIME_TYPES)
  contentType: string;
}

export class UpdateMediaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transcript?: string;
}

export class CreateMediaDto extends UpdateMediaDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  testId: number;

  @ApiProperty({ enum: MediaKind })
  @IsEnum(MediaKind)
  kind: MediaKind;

  @ApiProperty({ description: 'Key returned by POST /media/upload-url' })
  @Matches(MEDIA_KEY_PATTERN, { message: 'Invalid storage key' })
  storageKey: string;
}

export class ListMediaDto extends PageOptionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly testId?: number;

  @ApiPropertyOptional({ enum: MediaKind })
  @IsOptional()
  @IsEnum(MediaKind)
  readonly kind?: MediaKind;
}
