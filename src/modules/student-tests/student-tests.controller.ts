import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiPaginatedResponse } from '../../shared/decorators/api-paginated-response.decorator.js';
import { ErrorResponseDto } from '../../shared/dto/index.js';
import { AuthClient } from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
import {
  StudentTestDetailDto,
  StudentTestListItemDto,
} from './dto/student-test-response.dto.js';
import { ListStudentTestsDto } from './dto/student-tests.dto.js';
import { StudentTestsService } from './student-tests.service.js';

@Clients(AuthClient.WEB)
@ApiBearerAuth()
@Controller('student/tests')
@ApiTags('Student Tests')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class StudentTestsController {
  constructor(private readonly studentTestsService: StudentTestsService) {}

  @Get()
  @ApiOperation({ summary: 'List published tests (paginated)' })
  @ApiPaginatedResponse(StudentTestListItemDto)
  @CheckPermissions()
  findAll(@Query() query: ListStudentTestsDto) {
    return this.studentTestsService.findAll(query);
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Get a published test with all its content, without answers',
  })
  @ApiOkResponse({ type: StudentTestDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions()
  findBySlug(@Param('slug') slug: string) {
    return this.studentTestsService.findBySlug(slug);
  }
}
