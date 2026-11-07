import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { ErrorResponseDto } from '../../shared/dto/index.js';
import {
  AuthClient,
  type IRequestWithUser,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
import {
  AssessmentDto,
  GradingQueueItemDto,
  GradingSectionDto,
} from './dto/grading-response.dto.js';
import { CreateAssessmentDto, ListGradingQueueDto } from './dto/grading.dto.js';
import { GradingQueryService } from './grading-query.service.js';
import { GradingService } from './grading.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('grading')
@ApiTags('Grading')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class GradingController {
  constructor(
    private readonly gradingService: GradingService,
    private readonly gradingQueryService: GradingQueryService,
  ) {}

  @Get('queue')
  @ApiOperation({
    summary:
      'Writing and Speaking sections waiting for or finished with grading',
  })
  @ApiPaginatedResponse(GradingQueueItemDto)
  @CheckPermissions([PermissionAction.READ, PermissionSubject.ASSESSMENT])
  findQueue(@Query() dto: ListGradingQueueDto) {
    return this.gradingQueryService.findQueue(dto);
  }

  @Get('sections/:id')
  @ApiOperation({ summary: 'The grading screen of one section' })
  @ApiOkResponse({ type: GradingSectionDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.ASSESSMENT])
  findSection(@Param('id', ParseUUIDPipe) id: string) {
    return this.gradingQueryService.findSection(id);
  }

  @Get('sections/:id/assessments')
  @ApiOperation({ summary: 'Every revision of a section, newest first' })
  @ApiOkResponse({ type: [AssessmentDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.ASSESSMENT])
  findAssessments(@Param('id', ParseUUIDPipe) id: string) {
    return this.gradingQueryService.findAssessments(id);
  }

  @Post('sections/:id/assessments')
  @ApiOperation({
    summary: 'Grade a Writing or Speaking section, or correct an earlier grade',
  })
  @ApiCreatedResponse({ type: AssessmentDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'ASSESSMENT_REVISION_CONFLICT or SECTION_NOT_GRADABLE',
  })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.ASSESSMENT])
  create(
    @Req() req: IRequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAssessmentDto,
  ) {
    return this.gradingService.createAssessment(id, dto, req.user.id);
  }
}
