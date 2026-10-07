import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PageOptionsDto } from '../../../shared/dto/index.js';
import { Status } from '../../../types/common.type.js';
import { Provider } from '../../../types/user.type.js';

const EDITABLE_STATUSES = [Status.ACTIVE, Status.INACTIVE] as const;

export class CreateUserDto {
  @ApiProperty({ example: 'test1@gmail.com' })
  @IsEmail({}, { message: 'Invalid email address' })
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(255)
  firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: '1990-01-31' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  roleId: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @ApiPropertyOptional({ enum: Provider, default: Provider.LOCAL })
  @IsOptional()
  @IsEnum(Provider)
  provider?: Provider;
}

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['email', 'password', 'provider'] as const),
) {
  @ApiPropertyOptional({ enum: EDITABLE_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  status?: Status.ACTIVE | Status.INACTIVE;
}

export class ListUsersDto extends PageOptionsDto {
  @ApiPropertyOptional({
    description: 'Matches email, first name, last name or phone',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  readonly roleId?: number;

  @ApiPropertyOptional({ enum: EDITABLE_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_STATUSES)
  readonly status?: Status.ACTIVE | Status.INACTIVE;
}

export class DeleteUsersDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids: string[];
}
