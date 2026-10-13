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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AuthClient,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
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
export class QuestionGroupsController {
  constructor(private readonly questionGroupsService: QuestionGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List question groups of a test part' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findAll(@Query() query: ListQuestionGroupsDto) {
    return this.questionGroupsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a question group with its questions and passages',
  })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.questionGroupsService.findById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a question group (optionally with questions) to a part',
  })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.TEST])
  create(@Body() dto: CreateQuestionGroupDto) {
    return this.questionGroupsService.create(dto);
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder question groups of a part' })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.TEST])
  reorder(@Body() dto: ReorderQuestionGroupsDto) {
    return this.questionGroupsService.reorder(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a question group; passageIds replaces all links',
  })
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
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.TEST])
  deleteByIds(@Body() dto: DeleteQuestionGroupsDto) {
    return this.questionGroupsService.deleteByIds(dto);
  }
}
