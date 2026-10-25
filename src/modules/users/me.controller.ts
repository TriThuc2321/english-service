import { Body, Controller, Delete, Post, Put, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ErrorResponseDto } from '../../shared/dto/index.js';
import { type IRequestWithUser } from '../../types/auth.type.js';
import { MediaKind, MediaScope } from '../../types/media.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { UploadUrlResponseDto } from '../media/dto/media.dto.js';
import { MediaService } from '../media/media.service.js';
import { CreateAvatarUploadUrlDto, SetAvatarDto } from './dto/me.dto.js';
import { AvatarResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

@ApiBearerAuth()
@Controller('me')
@ApiTags('Me')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
export class MeController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mediaService: MediaService,
  ) {}

  @Post('avatar/upload-url')
  @ApiOperation({
    summary:
      'Get a presigned PUT URL for a new avatar; upload it, then call PUT /me/avatar',
  })
  @ApiCreatedResponse({ type: UploadUrlResponseDto })
  @CheckPermissions()
  createAvatarUploadUrl(
    @Body() { contentType }: CreateAvatarUploadUrlDto,
    @Req() req: IRequestWithUser,
  ) {
    return this.mediaService.createUploadUrl({
      scope: MediaScope.AVATAR,
      ownerId: req.user.id,
      kind: MediaKind.IMAGE,
      contentType,
    });
  }

  @Put('avatar')
  @ApiOperation({ summary: 'Set the uploaded file as the current avatar' })
  @ApiOkResponse({ type: AvatarResponseDto })
  @CheckPermissions()
  async setAvatar(
    @Body() { storageKey }: SetAvatarDto,
    @Req() req: IRequestWithUser,
  ) {
    const media = await this.mediaService.create(
      {
        scope: MediaScope.AVATAR,
        ownerId: req.user.id,
        kind: MediaKind.IMAGE,
        storageKey,
      },
      req.user.id,
    );

    return this.usersService.setAvatar(req.user.id, media.id, req.user.id);
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Remove the current avatar' })
  @ApiOkResponse({ type: AvatarResponseDto })
  @CheckPermissions()
  removeAvatar(@Req() req: IRequestWithUser) {
    return this.usersService.setAvatar(req.user.id, null, req.user.id);
  }
}
