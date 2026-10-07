import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';
import { Status } from '../../../types/common.type.js';

const EDITABLE_STATUSES = [Status.ACTIVE, Status.INACTIVE] as const;

export class CreateRoleDto {
  @ApiProperty({ example: 'Administrator' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'ADMIN' })
  @IsString()
  @IsNotEmpty({ message: 'Code is required' })
  @MaxLength(255)
  code: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canAccessCms?: boolean;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  permissionIds?: number[];
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @ApiPropertyOptional({ enum: EDITABLE_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  status?: Status.ACTIVE | Status.INACTIVE;
}

export class ListRolesDto extends PageOptionsDto {
  @ApiPropertyOptional({ description: 'Matches name or code' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly search?: string;

  @ApiPropertyOptional({ enum: EDITABLE_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  readonly status?: Status.ACTIVE | Status.INACTIVE;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  readonly canAccessCms?: boolean;
}

export class DeleteRolesDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}
