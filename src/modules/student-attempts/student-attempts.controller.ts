import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
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
import { AuthClient, type IRequestWithUser } from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
import { AttemptResultService } from './attempt-result.service.js';
import {
  AttemptDto,
  AttemptInProgressErrorDto,
  AttemptListItemDto,
  AttemptResultDto,
  SaveAnswersResultDto,
} from './dto/student-attempt-response.dto.js';
import {
  ListAttemptsDto,
  SaveAnswersDto,
  StartAttemptDto,
} from './dto/student-attempts.dto.js';
import { StudentAttemptsService } from './student-attempts.service.js';

@Clients(AuthClient.WEB)
@ApiBearerAuth()
@Controller('student/attempts')
@ApiTags('Student Attempts')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class StudentAttemptsController {
  constructor(
    private readonly studentAttemptsService: StudentAttemptsService,
    private readonly attemptResultService: AttemptResultService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Start an attempt on a published test' })
  @ApiCreatedResponse({ type: AttemptDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: AttemptInProgressErrorDto,
    description: 'ATTEMPT_IN_PROGRESS, with the id of the open attempt',
  })
  @CheckPermissions()
  start(@Req() req: IRequestWithUser, @Body() dto: StartAttemptDto) {
    return this.studentAttemptsService.start(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my attempts, newest first (paginated)' })
  @ApiPaginatedResponse(AttemptListItemDto)
  @CheckPermissions()
  findAll(@Req() req: IRequestWithUser, @Query() query: ListAttemptsDto) {
    return this.studentAttemptsService.findAll(req.user.id, query);
  }

  @Get(':id/result')
  @ApiOperation({ summary: 'Scores and full review of a graded attempt' })
  @ApiOkResponse({ type: AttemptResultDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'ATTEMPT_NOT_GRADED',
  })
  @CheckPermissions()
  async result(
    @Req() req: IRequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.studentAttemptsService.expireIfOverdue(req.user.id, id);
    return this.attemptResultService.result(req.user.id, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get the state of an attempt to resume it' })
  @ApiOkResponse({ type: AttemptDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions()
  findOne(
    @Req() req: IRequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentAttemptsService.findOne(req.user.id, id);
  }

  @Put(':id/answers')
  @ApiOperation({ summary: 'Autosave a batch of answers' })
  @ApiOkResponse({ type: SaveAnswersResultDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions()
  saveAnswers(
    @Req() req: IRequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveAnswersDto,
  ) {
    return this.studentAttemptsService.saveAnswers(req.user.id, id, dto);
  }

  @Post(':id/sections/:sectionId/submit')
  @ApiOperation({
    summary: 'Submit the open section; grades the attempt after the last one',
  })
  @ApiCreatedResponse({ type: AttemptDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions()
  submitSection(
    @Req() req: IRequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseIntPipe) sectionId: number,
  ) {
    return this.studentAttemptsService.submitSection(
      req.user.id,
      id,
      sectionId,
    );
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit the whole attempt and grade it' })
  @ApiCreatedResponse({ type: AttemptDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions()
  submit(@Req() req: IRequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.studentAttemptsService.submit(req.user.id, id);
  }
}
