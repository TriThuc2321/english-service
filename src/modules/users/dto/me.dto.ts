import { ApiProperty } from '@nestjs/swagger';
import { IsIn, Matches } from 'class-validator';

import { MediaKind } from '../../../types/media.type.js';
import {
  MEDIA_KEY_PATTERN,
  MEDIA_MIME_EXTENSIONS,
} from '../../media/media.constant.js';

const AVATAR_MIME_TYPES = Object.keys(MEDIA_MIME_EXTENSIONS[MediaKind.IMAGE]);

export class CreateAvatarUploadUrlDto {
  @ApiProperty({ enum: AVATAR_MIME_TYPES, example: 'image/webp' })
  @IsIn(AVATAR_MIME_TYPES)
  contentType: string;
}

export class SetAvatarDto {
  @ApiProperty({ description: 'Key returned by POST /me/avatar/upload-url' })
  @Matches(MEDIA_KEY_PATTERN, { message: 'Invalid storage key' })
  storageKey: string;
}
