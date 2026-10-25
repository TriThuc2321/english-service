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

import { DeleteResultDto, ErrorResponseDto } from '../../shared/dto/index.js';
import {
  AuthClient,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
import { TestSectionDto } from './dto/test-section-response.dto.js';
import {
  CreateTestSectionDto,
  DeleteTestSectionsDto,
  ListTestSectionsDto,
  ReorderTestSectionsDto,
  UpdateTestSectionDto,
} from './dto/test-sections.dto.js';
import { TestSectionsService } from './test-sections.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('test-sections')
@ApiTags('Test Sections')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class TestSectionsController {
  constructor(private readonly testSectionsService: TestSectionsService) {}

  @Get()
  @ApiOperation({ summary: 'List sections of a test' })
  @ApiOkResponse({ type: [TestSectionDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findAll(@Query() query: ListTestSectionsDto) {
    return this.testSectionsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a test section by id' })
  @ApiOkResponse({ type: TestSectionDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.testSectionsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a section to a test' })
  @ApiCreatedResponse({ type: TestSectionDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.TEST])
  create(@Body() dto: CreateTestSectionDto) {
    return this.testSectionsService.create(dto);
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder sections of a test' })
  @ApiOkResponse({ type: [TestSectionDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.TEST])
  reorder(@Body() dto: ReorderTestSectionsDto) {
    return this.testSectionsService.reorder(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a test section' })
  @ApiOkResponse({ type: TestSectionDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.TEST])
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTestSectionDto,
  ) {
    return this.testSectionsService.update(id, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete test sections (and their parts) by ids' })
  @ApiOkResponse({ type: DeleteResultDto })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.TEST])
  deleteByIds(@Body() dto: DeleteTestSectionsDto) {
    return this.testSectionsService.deleteByIds(dto);
  }
}
