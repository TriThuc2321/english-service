import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
  CreateUserDto,
  DeleteUsersDto,
  ListUsersDto,
  UpdateUserDto,
} from './dto/users.dto.js';
import { UsersService } from './users.service.js';

@ApiBearerAuth()
@Controller('users')
@ApiTags('Users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (paginated)' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.USER])
  findAll(@Query() query: ListUsersDto) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  @CheckPermissions([PermissionAction.READ, PermissionSubject.USER])
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  @CheckPermissions([PermissionAction.CREATE, PermissionSubject.USER])
  create(@Body() dto: CreateUserDto, @Req() req: IRequestWithUser) {
    return this.userService.create(dto, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  @CheckPermissions([PermissionAction.UPDATE, PermissionSubject.USER])
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: IRequestWithUser,
  ) {
    return this.userService.update(id, dto, req.user.id);
  }

  @Delete()
  @ApiOperation({ summary: 'Soft-delete users by ids' })
  @CheckPermissions([PermissionAction.DELETE, PermissionSubject.USER])
  deleteByIds(@Body() dto: DeleteUsersDto, @Req() req: IRequestWithUser) {
    return this.userService.deleteByIds(dto, req.user.id);
  }
}
