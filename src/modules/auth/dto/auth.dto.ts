import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

import { AuthClient, isServerClient } from '../../../types/auth.type.js';

export class ClientDto {
  @ApiProperty({ enum: AuthClient, description: 'Frontend making the request' })
  @IsEnum(AuthClient)
  client: AuthClient;
}

export class LoginDto extends ClientDto {
  @ApiProperty({ example: 'test1@gmail.com', type: String })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}

export class RefreshDto extends ClientDto {
  @ApiPropertyOptional({
    description:
      'Required for server clients, which receive the refresh token in the body instead of a cookie',
  })
  @ValidateIf((dto: RefreshDto) => isServerClient(dto.client))
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}

export class LogoutDto extends ClientDto {
  @ApiPropertyOptional({
    description:
      'Revoke every session for the user across all clients, not just the current one',
  })
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;

  @ApiPropertyOptional({
    description: 'Server clients only; web clients use the cookie',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
