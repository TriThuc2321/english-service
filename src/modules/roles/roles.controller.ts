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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  type IRequestWithUser,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import {
  CreateRoleDto,
  DeleteRolesDto,
  ListRolesDto,
  UpdateRoleDto,
} from './dto/roles.dto.js';
import { RolesService } from './roles.service.js';

@ApiBearerAuth()
@Controller('roles')
@ApiTags('Roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'List roles (paginated)' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.ROLE])
  findAll(@Query() query: ListRolesDto) {
    return this.rolesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a role by id' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.ROLE])
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a role' })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.ROLE])
  create(@Body() dto: CreateRoleDto, @Req() req: IRequestWithUser) {
    return this.rolesService.create(dto, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a role' })
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
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.ROLE])
  deleteByIds(@Body() dto: DeleteRolesDto, @Req() req: IRequestWithUser) {
    return this.rolesService.deleteByIds(dto, req.user.id);
  }
}
