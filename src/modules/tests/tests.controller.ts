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
  CreateTestDto,
  DeleteTestsDto,
  ListTestsDto,
  UpdateTestDto,
} from './dto/tests.dto.js';
import { TestsService } from './tests.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('tests')
@ApiTags('Tests')
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get()
  @ApiOperation({ summary: 'List tests (paginated)' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findAll(@Query() query: ListTestsDto) {
    return this.testsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a test with its sections' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.testsService.findById(id);
  }

  @Get(':id/tree')
  @ApiOperation({
    summary:
      'Get a test with sections, parts, groups, questions (with answers) and linked passages',
  })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findTree(@Param('id', ParseIntPipe) id: number) {
    return this.testsService.findTree(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a test (optionally with sections)' })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.TEST])
  create(@Body() dto: CreateTestDto, @Req() req: IRequestWithUser) {
    return this.testsService.create(dto, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a test; sections change via /test-sections. Publishing validates the whole test and returns every issue found',
  })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.TEST])
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTestDto,
    @Req() req: IRequestWithUser,
  ) {
    return this.testsService.update(id, dto, req.user.id);
  }

  @Delete()
  @ApiOperation({ summary: 'Soft-delete tests by ids' })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.TEST])
  deleteByIds(@Body() dto: DeleteTestsDto, @Req() req: IRequestWithUser) {
    return this.testsService.deleteByIds(dto, req.user.id);
  }
}
