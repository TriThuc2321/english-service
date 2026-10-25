import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Permission } from '../../entities/permission.entity.js';
import { ErrorResponseDto } from '../../shared/dto/index.js';
import {
  AuthClient,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CheckPermissions } from '../auth/decorators/check-permissions.decorator.js';
import { Clients } from '../auth/decorators/clients.decorator.js';
import { PermissionListItemDto } from './dto/permission-response.dto.js';
import { PermissionsService } from './permissions.service.js';

@Clients(AuthClient.BO)
@ApiTags('Permissions')
@Controller('permissions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @CheckPermissions([PermissionAction.READ, PermissionSubject.PERMISSION])
  @ApiOperation({ summary: 'Get all permissions' })
  @ApiOkResponse({ type: [PermissionListItemDto] })
  async findAll(): Promise<Permission[]> {
    return this.permissionsService.findAll();
  }
}
