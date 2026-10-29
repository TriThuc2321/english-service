import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import { TestImportResultDto } from './dto/test-import-response.dto.js';
import { ImportTestDto } from './dto/test-import.dto.js';
import { TestImportService } from './test-import.service.js';

@Clients(AuthClient.BO)
@ApiBearerAuth()
@Controller('tests')
@ApiTags('Tests')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
export class TestImportController {
  constructor(private readonly testImportService: TestImportService) {}

  @Post('import')
  @ApiOperation({
    summary:
      'Create a DRAFT test with its sections, parts, new passages, groups and questions in one transaction',
  })
  @ApiCreatedResponse({ type: TestImportResultDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @CheckPermissions(
    [PermissionAction.CREATE, PermissionSubject.TEST],
    [PermissionAction.CREATE, PermissionSubject.PASSAGE],
  )
  import(@Body() dto: ImportTestDto, @Req() req: IRequestWithUser) {
    return this.testImportService.import(dto, req.user.id);
  }
}
