import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiPaginatedResponse } from '../../shared/decorators/api-paginated-response.decorator.js';
import { ErrorResponseDto } from '../../shared/dto/index.js';
import {
  AuthClient,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
import { StudentTestDetailDto } from '../student-tests/dto/student-test-response.dto.js';
import { AttemptsQueryService } from './attempts-query.service.js';
import {
  StudentAttemptItemDto,
  StudentAttemptResultDto,
} from './dto/attempts-response.dto.js';
import { ListAttemptsQueryDto } from './dto/attempts.dto.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('attempts')
@ApiTags('Attempts')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class AttemptsController {
  constructor(private readonly attemptsQueryService: AttemptsQueryService) {}

  @Get()
  @ApiOperation({ summary: 'Attempts of every student, newest first' })
  @ApiPaginatedResponse(StudentAttemptItemDto)
  @CheckPermissions([PermissionAction.READ, PermissionSubject.ASSESSMENT])
  findAll(@Query() query: ListAttemptsQueryDto) {
    return this.attemptsQueryService.findAll(query);
  }

  @Get(':id/result')
  @ApiOperation({ summary: 'Scores and full review of a student attempt' })
  @ApiOkResponse({ type: StudentAttemptResultDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'ATTEMPT_NOT_GRADED, only while in progress',
  })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.ASSESSMENT])
  result(@Param('id', ParseUUIDPipe) id: string) {
    return this.attemptsQueryService.result(id);
  }

  @Get(':id/content')
  @ApiOperation({
    summary: 'Test content of a student attempt (its sections only)',
  })
  @ApiOkResponse({ type: StudentTestDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.ASSESSMENT])
  content(@Param('id', ParseUUIDPipe) id: string) {
    return this.attemptsQueryService.content(id);
  }
}
