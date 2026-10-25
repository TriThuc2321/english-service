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
import { DeleteResultDto, ErrorResponseDto } from '../../shared/dto/index.js';
import {
  AuthClient,
  type IRequestWithUser,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
import { RoleDetailDto, RoleListItemDto } from './dto/role-response.dto.js';
import {
  CreateRoleDto,
  DeleteRolesDto,
  ListRolesDto,
  UpdateRoleDto,
} from './dto/roles.dto.js';
import { RolesService } from './roles.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('roles')
@ApiTags('Roles')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'List roles (paginated)' })
  @ApiPaginatedResponse(RoleListItemDto)
  @CheckPermissions([PermissionAction.READ, PermissionSubject.ROLE])
  findAll(@Query() query: ListRolesDto) {
    return this.rolesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a role by id' })
  @ApiOkResponse({ type: RoleDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.ROLE])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a role' })
  @ApiCreatedResponse({ type: RoleDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.ROLE])
  create(@Body() dto: CreateRoleDto, @Req() req: IRequestWithUser) {
    return this.rolesService.create(dto, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a role' })
  @ApiOkResponse({ type: RoleDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.ROLE])
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @Req() req: IRequestWithUser,
  ) {
    return this.rolesService.update(id, dto, req.user.id);
  }

  @Delete()
  @ApiOperation({ summary: 'Soft-delete roles by ids' })
  @ApiOkResponse({ type: DeleteResultDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.ROLE])
  deleteByIds(@Body() dto: DeleteRolesDto, @Req() req: IRequestWithUser) {
    return this.rolesService.deleteByIds(dto, req.user.id);
  }
}
