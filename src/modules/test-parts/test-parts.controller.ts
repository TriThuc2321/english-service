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

import {
  AuthClient,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
import {
  CreateTestPartDto,
  DeleteTestPartsDto,
  ListTestPartsDto,
  ReorderTestPartsDto,
  UpdateTestPartDto,
} from './dto/test-parts.dto.js';
import { TestPartsService } from './test-parts.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('test-parts')
@ApiTags('Test Parts')
export class TestPartsController {
  constructor(private readonly testPartsService: TestPartsService) {}

  @Get()
  @ApiOperation({ summary: 'List parts of a test section' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findAll(@Query() query: ListTestPartsDto) {
    return this.testPartsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a test part by id' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.testPartsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a part to a test section' })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.TEST])
  create(@Body() dto: CreateTestPartDto) {
    return this.testPartsService.create(dto);
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder parts of a test section' })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.TEST])
  reorder(@Body() dto: ReorderTestPartsDto) {
    return this.testPartsService.reorder(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a test part' })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.TEST])
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTestPartDto,
  ) {
    return this.testPartsService.update(id, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete test parts (and their groups) by ids' })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.TEST])
  deleteByIds(@Body() dto: DeleteTestPartsDto) {
    return this.testPartsService.deleteByIds(dto);
  }
}
