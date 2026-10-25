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

import {
  AuditMetadataWithActorsDto,
  PageOptionsDto,
} from '../../../shared/dto/index.js';
import { MediaKind, MediaScope } from '../../../types/media.type.js';
import { MEDIA_KEY_PATTERN, MEDIA_MIME_TYPES } from '../media.constant.js';

export class CreateUploadUrlDto {
  @ApiProperty({ enum: MediaScope, enumName: 'MediaScope' })
  @IsEnum(MediaScope)
  scope: MediaScope;

  @ApiPropertyOptional({
    description: 'Test id for TEST, user id for AVATAR; omit for LIBRARY',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ownerId?: string;

  @ApiProperty({ enum: MediaKind, enumName: 'MediaKind' })
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
  @ApiProperty({ enum: MediaScope, enumName: 'MediaScope' })
  @IsEnum(MediaScope)
  scope: MediaScope;

  @ApiPropertyOptional({
    description: 'Test id for TEST, user id for AVATAR; omit for LIBRARY',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ownerId?: string;

  @ApiProperty({ enum: MediaKind, enumName: 'MediaKind' })
  @IsEnum(MediaKind)
  kind: MediaKind;

  @ApiProperty({ description: 'Key returned by POST /media/upload-url' })
  @Matches(MEDIA_KEY_PATTERN, { message: 'Invalid storage key' })
  storageKey: string;
}

export class ListMediaDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: MediaScope, enumName: 'MediaScope' })
  @IsOptional()
  @IsEnum(MediaScope)
  readonly scope?: MediaScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly ownerId?: string;

  @ApiPropertyOptional({ enum: MediaKind, enumName: 'MediaKind' })
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

export class MediaDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: MediaScope, enumName: 'MediaScope' })
  scope: MediaScope;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Test id for TEST, user id for AVATAR, null for LIBRARY',
  })
  ownerId: string | null;

  @ApiProperty({ enum: MediaKind, enumName: 'MediaKind' })
  kind: MediaKind;

  @ApiProperty()
  storageKey: string;

  @ApiProperty({ type: String, nullable: true })
  mimeType: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'bigint, serialised as a string',
    example: '1048576',
  })
  sizeBytes: string | null;

  @ApiProperty({ type: Number, nullable: true })
  durationMs: number | null;

  @ApiProperty({ type: String, nullable: true })
  transcript: string | null;

  @ApiProperty({ type: AuditMetadataWithActorsDto })
  auditMetadata: AuditMetadataWithActorsDto;

  @ApiProperty({ description: 'Public CDN URL built from storageKey' })
  url: string;
}
