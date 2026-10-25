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
import { QuestionDto } from './dto/question-response.dto.js';
import {
  CreateQuestionDto,
  DeleteQuestionsDto,
  ListQuestionsDto,
  ReorderQuestionsDto,
  UpdateQuestionDto,
} from './dto/questions.dto.js';
import { QuestionsService } from './questions.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('questions')
@ApiTags('Questions')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  @ApiOperation({ summary: 'List questions of a group (with answers)' })
  @ApiOkResponse({ type: [QuestionDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findAll(@Query() query: ListQuestionsDto) {
    return this.questionsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a question by id (with answer)' })
  @ApiOkResponse({ type: QuestionDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.questionsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a question to a group' })
  @ApiCreatedResponse({ type: QuestionDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.TEST])
  create(@Body() dto: CreateQuestionDto) {
    return this.questionsService.create(dto);
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder questions of a group' })
  @ApiOkResponse({ type: [QuestionDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.TEST])
  reorder(@Body() dto: ReorderQuestionsDto) {
    return this.questionsService.reorder(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a question; only answer/explanation/evidence once locked',
  })
  @ApiOkResponse({ type: QuestionDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.TEST])
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questionsService.update(id, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete questions by ids' })
  @ApiOkResponse({ type: DeleteResultDto })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.TEST])
  deleteByIds(@Body() dto: DeleteQuestionsDto) {
    return this.questionsService.deleteByIds(dto);
  }
}
