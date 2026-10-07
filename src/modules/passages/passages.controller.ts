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
  type IRequestWithUser,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import {
  CreatePassageDto,
  DeletePassagesDto,
  ListPassagesDto,
  UpdatePassageDto,
} from './dto/passages.dto.js';
import { PassagesService } from './passages.service.js';

@ApiBearerAuth()
@Controller('passages')
@ApiTags('Passages')
export class PassagesController {
  constructor(private readonly passagesService: PassagesService) {}

  @Get()
  @ApiOperation({ summary: 'List passages (paginated)' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.PASSAGE])
  findAll(@Query() query: ListPassagesDto) {
    return this.passagesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a passage with its paragraphs' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.PASSAGE])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.passagesService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a passage (optionally with paragraphs)' })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.PASSAGE])
  create(@Body() dto: CreatePassageDto, @Req() req: IRequestWithUser) {
    return this.passagesService.create(dto, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a passage; `paragraphs` replaces the whole list',
  })
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
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.PASSAGE])
  deleteByIds(@Body() dto: DeletePassagesDto, @Req() req: IRequestWithUser) {
    return this.passagesService.deleteByIds(dto, req.user.id);
  }
}
