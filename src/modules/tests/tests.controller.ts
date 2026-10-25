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
import { TestDetailDto, TestListItemDto } from './dto/test-response.dto.js';
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
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get()
  @ApiOperation({ summary: 'List tests (paginated)' })
  @ApiPaginatedResponse(TestListItemDto)
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findAll(@Query() query: ListTestsDto) {
    return this.testsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a test with its sections' })
  @ApiOkResponse({ type: TestDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.testsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a test (optionally with sections)' })
  @ApiCreatedResponse({ type: TestDetailDto })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.TEST])
  create(@Body() dto: CreateTestDto, @Req() req: IRequestWithUser) {
    return this.testsService.create(dto, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a test; sections change via /test-sections',
  })
  @ApiOkResponse({ type: TestDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
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
  @ApiOkResponse({ type: DeleteResultDto })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.TEST])
  deleteByIds(@Body() dto: DeleteTestsDto, @Req() req: IRequestWithUser) {
    return this.testsService.deleteByIds(dto, req.user.id);
  }
}
