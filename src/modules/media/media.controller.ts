import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AuthClient,
  type IRequestWithUser,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
import {
  CreateMediaDto,
  CreateUploadUrlDto,
  ListMediaDto,
  UpdateMediaDto,
} from './dto/media.dto.js';
import { MediaService } from './media.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('media')
@ApiTags('Media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-url')
  @ApiOperation({
    summary:
      'Get a presigned PUT URL; upload the file with the returned headers, then call POST /media',
  })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.MEDIA])
  createUploadUrl(@Body() dto: CreateUploadUrlDto) {
    return this.mediaService.createUploadUrl(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List media (paginated, with public URLs)' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.MEDIA])
  findAll(@Query() query: ListMediaDto) {
    return this.mediaService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a media with its public URL' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.MEDIA])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Register an uploaded file as media' })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.MEDIA])
  create(@Body() dto: CreateMediaDto, @Req() req: IRequestWithUser) {
    return this.mediaService.create(dto, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update media metadata (duration, transcript)' })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.MEDIA])
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMediaDto,
    @Req() req: IRequestWithUser,
  ) {
    return this.mediaService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete media and its file (409 if in use)' })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.MEDIA])
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.delete(id);
  }
}
