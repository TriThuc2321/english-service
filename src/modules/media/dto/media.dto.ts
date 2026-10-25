import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';
import { MediaKind, MediaScope } from '../../../types/media.type.js';
import { MEDIA_KEY_PATTERN, MEDIA_MIME_TYPES } from '../media.constant.js';

export class CreateUploadUrlDto {
  @ApiProperty({ enum: MediaScope })
  @IsEnum(MediaScope)
  scope: MediaScope;

  @ApiProperty({ description: 'Test id for TEST, user id for AVATAR' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ownerId: string;

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
  @ApiProperty({ enum: MediaScope })
  @IsEnum(MediaScope)
  scope: MediaScope;

  @ApiProperty({ description: 'Test id for TEST, user id for AVATAR' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ownerId: string;

  @ApiProperty({ enum: MediaKind })
  @IsEnum(MediaKind)
  kind: MediaKind;

  @ApiProperty({ description: 'Key returned by POST /media/upload-url' })
  @Matches(MEDIA_KEY_PATTERN, { message: 'Invalid storage key' })
  storageKey: string;
}

export class ListMediaDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: MediaScope })
  @IsOptional()
  @IsEnum(MediaScope)
  readonly scope?: MediaScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly ownerId?: string;

  @ApiPropertyOptional({ enum: MediaKind })
  @IsOptional()
  @IsEnum(MediaKind)
  readonly kind?: MediaKind;
}

export class UploadUrlResponseDto {
  @ApiProperty({ description: 'Pass back when confirming the upload' })
  storageKey: string;

  @ApiProperty({ description: 'Presigned PUT URL' })
  uploadUrl: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Headers the PUT request must send unchanged',
    example: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
  headers: Record<string, string>;

  @ApiProperty({ description: 'Seconds until uploadUrl expires' })
  expiresIn: number;
}
