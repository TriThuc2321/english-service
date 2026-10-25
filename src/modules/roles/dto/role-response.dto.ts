import { ApiProperty } from '@nestjs/swagger';

import { AuditMetadataWithActorsDto } from '../../../shared/dto/index.js';
import { Status } from '../../../types/common.type.js';
import { PermissionDto } from '../../permissions/dto/permission-response.dto.js';

export class RoleListItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  canAccessCms: boolean;

  @ApiProperty({ enum: Status, enumName: 'Status' })
  status: Status;

  @ApiProperty({ description: 'Seeded role; code and status are fixed' })
  systemRole: boolean;

  @ApiProperty({ type: AuditMetadataWithActorsDto })
  auditMetadata: AuditMetadataWithActorsDto;
}

export class RoleDetailDto extends RoleListItemDto {
  @ApiProperty({
    type: [PermissionDto],
    description: 'Active permissions only',
  })
  permissions: PermissionDto[];
}
