import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

import { PermissionDto } from '../../permissions/dto/permission-response.dto.js';
import {
  UserListItemDto,
  UserRoleDto,
} from '../../users/dto/user-response.dto.js';

export class TokenResponseDto {
  @ApiProperty()
  access_token: string;

  @ApiPropertyOptional({
    description:
      'web client only; bo gets it as the httpOnly refresh_token_bo cookie',
  })
  refresh_token?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'web client only' })
  refresh_token_expires_at?: string;
}

export class ProfileRoleDto extends UserRoleDto {
  @ApiProperty({ type: [PermissionDto] })
  permissions: PermissionDto[];
}

export class ProfileDto extends PickType(UserListItemDto, [
  'id',
  'email',
  'firstName',
  'lastName',
  'avatar',
  'phone',
  'emailVerified',
  'provider',
  'status',
  'roleId',
] as const) {
  @ApiProperty({ type: ProfileRoleDto })
  role: ProfileRoleDto;
}
