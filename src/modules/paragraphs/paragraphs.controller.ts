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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionAction, PermissionSubject } from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import {
  CreateParagraphDto,
  DeleteParagraphsDto,
  ListParagraphsDto,
  ReorderParagraphsDto,
  UpdateParagraphDto,
} from './dto/paragraphs.dto.js';
import { ParagraphsService } from './paragraphs.service.js';

@ApiBearerAuth()
@Controller('paragraphs')
@ApiTags('Paragraphs')
export class ParagraphsController {
  constructor(private readonly paragraphsService: ParagraphsService) {}

  @Get()
  @ApiOperation({ summary: 'List paragraphs of a passage (paginated)' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.PARAGRAPH])
  findAll(@Query() query: ListParagraphsDto) {
    return this.paragraphsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a paragraph by id' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.PARAGRAPH])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.paragraphsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a paragraph to a passage' })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.PARAGRAPH])
  create(@Body() dto: CreateParagraphDto) {
    return this.paragraphsService.create(dto);
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder paragraphs of a passage' })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.PARAGRAPH])
  reorder(@Body() dto: ReorderParagraphsDto) {
    return this.paragraphsService.reorder(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a paragraph' })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.PARAGRAPH])
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateParagraphDto,
  ) {
    return this.paragraphsService.update(id, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete paragraphs by ids' })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.PARAGRAPH])
  deleteByIds(@Body() dto: DeleteParagraphsDto) {
    return this.paragraphsService.deleteByIds(dto);
  }
}
