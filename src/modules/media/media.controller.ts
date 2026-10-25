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
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiPaginatedResponse } from '../../shared/decorators/api-paginated-response.decorator.js';
import { DeleteResultDto, ErrorResponseDto } from '../../shared/dto/index.js';
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
  MediaDto,
  UpdateMediaDto,
  UploadUrlResponseDto,
} from './dto/media.dto.js';
import { MediaService } from './media.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('media')
@ApiTags('Media')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-url')
  @ApiOperation({
    summary:
      'Get a presigned PUT URL; upload the file with the returned headers, then call POST /media',
  })
  @ApiCreatedResponse({ type: UploadUrlResponseDto })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.MEDIA])
  createUploadUrl(@Body() dto: CreateUploadUrlDto) {
    return this.mediaService.createUploadUrl(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List media (paginated, with public URLs)' })
  @ApiPaginatedResponse(MediaDto)
  @CheckPermissions([PermissionAction.READ, PermissionSubject.MEDIA])
  findAll(@Query() query: ListMediaDto) {
    return this.mediaService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a media with its public URL' })
  @ApiOkResponse({ type: MediaDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.MEDIA])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Register an uploaded file as media' })
  @ApiCreatedResponse({ type: MediaDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.MEDIA])
  create(@Body() dto: CreateMediaDto, @Req() req: IRequestWithUser) {
    return this.mediaService.create(dto, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update media metadata (duration, transcript)' })
  @ApiOkResponse({ type: MediaDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
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
  @ApiOkResponse({ type: DeleteResultDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.MEDIA])
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.delete(id);
  }
}
