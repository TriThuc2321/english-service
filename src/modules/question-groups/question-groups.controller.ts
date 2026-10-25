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
import {
  QuestionGroupDetailDto,
  QuestionGroupListItemDto,
} from './dto/question-group-response.dto.js';
import {
  CreateQuestionGroupDto,
  DeleteQuestionGroupsDto,
  ListQuestionGroupsDto,
  ReorderQuestionGroupsDto,
  UpdateQuestionGroupDto,
} from './dto/question-groups.dto.js';
import { QuestionGroupsService } from './question-groups.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('question-groups')
@ApiTags('Question Groups')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class QuestionGroupsController {
  constructor(private readonly questionGroupsService: QuestionGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List question groups of a test part' })
  @ApiOkResponse({ type: [QuestionGroupListItemDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findAll(@Query() query: ListQuestionGroupsDto) {
    return this.questionGroupsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a question group with its questions and passages',
  })
  @ApiOkResponse({ type: QuestionGroupDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.questionGroupsService.findById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a question group (optionally with questions) to a part',
  })
  @ApiCreatedResponse({ type: QuestionGroupDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.TEST])
  create(@Body() dto: CreateQuestionGroupDto) {
    return this.questionGroupsService.create(dto);
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder question groups of a part' })
  @ApiOkResponse({ type: [QuestionGroupListItemDto] })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.TEST])
  reorder(@Body() dto: ReorderQuestionGroupsDto) {
    return this.questionGroupsService.reorder(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a question group; passageIds replaces all links',
  })
  @ApiOkResponse({ type: QuestionGroupDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.TEST])
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionGroupDto,
  ) {
    return this.questionGroupsService.update(id, dto);
  }

  @Delete()
  @ApiOperation({
    summary: 'Delete question groups (and their questions) by ids',
  })
  @ApiOkResponse({ type: DeleteResultDto })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.TEST])
  deleteByIds(@Body() dto: DeleteQuestionGroupsDto) {
    return this.questionGroupsService.deleteByIds(dto);
  }
}
