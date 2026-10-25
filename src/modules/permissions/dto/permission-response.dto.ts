import { ApiProperty } from '@nestjs/swagger';

import {
  PermissionAction,
  PermissionSubject,
} from '../../../types/auth.type.js';
import { Status } from '../../../types/common.type.js';

export class PermissionDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: PermissionAction, enumName: 'PermissionAction' })
  action: PermissionAction;

  @ApiProperty({ enum: PermissionSubject, enumName: 'PermissionSubject' })
  subject: PermissionSubject;
}

export class PermissionListItemDto extends PermissionDto {
  @ApiProperty({ enum: Status, enumName: 'Status' })
  status: Status;
}
