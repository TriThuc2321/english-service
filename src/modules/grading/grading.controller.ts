import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ErrorResponseDto } from '../../shared/dto/index.js';
import {
  AuthClient,
  type IRequestWithUser,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
import { AssessmentDto } from './dto/grading-response.dto.js';
import { CreateAssessmentDto } from './dto/grading.dto.js';
import { GradingService } from './grading.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('grading')
@ApiTags('Grading')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class GradingController {
  constructor(private readonly gradingService: GradingService) {}

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
