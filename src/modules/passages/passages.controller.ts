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
  PassageDetailDto,
  PassageListItemDto,
} from './dto/passage-response.dto.js';
import {
  CreatePassageDto,
  DeletePassagesDto,
  ListPassagesDto,
  UpdatePassageDto,
} from './dto/passages.dto.js';
import { PassagesService } from './passages.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('passages')
@ApiTags('Passages')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class PassagesController {
  constructor(private readonly passagesService: PassagesService) {}

  @Get()
  @ApiOperation({ summary: 'List passages (paginated)' })
  @ApiPaginatedResponse(PassageListItemDto)
  @CheckPermissions([PermissionAction.READ, PermissionSubject.PASSAGE])
  findAll(@Query() query: ListPassagesDto) {
    return this.passagesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a passage with its paragraphs' })
  @ApiOkResponse({ type: PassageDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.PASSAGE])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.passagesService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a passage (optionally with paragraphs)' })
  @ApiCreatedResponse({ type: PassageDetailDto })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.PASSAGE])
  create(@Body() dto: CreatePassageDto, @Req() req: IRequestWithUser) {
    return this.passagesService.create(dto, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a passage; `paragraphs` replaces the whole list',
  })
  @ApiOkResponse({ type: PassageDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.PASSAGE])
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePassageDto,
    @Req() req: IRequestWithUser,
  ) {
    return this.passagesService.update(id, dto, req.user.id);
  }

  @Delete()
  @ApiOperation({ summary: 'Soft-delete passages by ids' })
  @ApiOkResponse({ type: DeleteResultDto })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.PASSAGE])
  deleteByIds(@Body() dto: DeletePassagesDto, @Req() req: IRequestWithUser) {
    return this.passagesService.deleteByIds(dto, req.user.id);
  }
}
