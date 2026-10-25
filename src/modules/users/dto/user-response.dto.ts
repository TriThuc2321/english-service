import { ApiProperty } from '@nestjs/swagger';

import { AuditMetadataDto } from '../../../shared/dto/index.js';
import { Status } from '../../../types/common.type.js';
import { Provider } from '../../../types/user.type.js';

export class UserRoleDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  canAccessCms: boolean;
}

export class UserListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty()
  firstName: string;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Display URL: Google picture or the avatar media public URL',
  })
  avatar: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ enum: Provider, enumName: 'Provider' })
  provider: Provider;

  @ApiProperty({ enum: Status, enumName: 'Status' })
  status: Status;

  @ApiProperty()
  systemUser: boolean;

  @ApiProperty()
  roleId: number;

  @ApiProperty({ type: UserRoleDto })
  role: UserRoleDto;

  @ApiProperty({ type: AuditMetadataDto })
  auditMetadata: AuditMetadataDto;
}

export class UserDetailDto extends UserListItemDto {
  @ApiProperty({ type: String, nullable: true })
  address: string | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '1990-01-31',
  })
  dateOfBirth: string | null;

  @ApiProperty({ type: Number, nullable: true })
  avatarMediaId: number | null;
}

export class AvatarResponseDto {
  @ApiProperty({ type: String, nullable: true })
  avatar: string | null;
}
