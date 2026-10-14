import { Body, Controller, Delete, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type IRequestWithUser } from '../../types/auth.type.js';
import { MediaKind, MediaScope } from '../../types/media.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { MediaService } from '../media/media.service.js';
import { CreateAvatarUploadUrlDto, SetAvatarDto } from './dto/me.dto.js';
import { UsersService } from './users.service.js';

@ApiBearerAuth()
@Controller('me')
@ApiTags('Me')
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
  @CheckPermissions()
  removeAvatar(@Req() req: IRequestWithUser) {
    return this.usersService.setAvatar(req.user.id, null, req.user.id);
  }
}
