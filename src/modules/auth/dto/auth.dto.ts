import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

import { AuthClient, isServerClient } from '../../../types/auth.type.js';

export class ClientDto {
  @ApiProperty({
    enum: AuthClient,
    enumName: 'AuthClient',
    description: 'Frontend making the request',
  })
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

export class EmailDto {
  @ApiProperty({ example: 'student@example.com', type: String })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;
}

const PASSWORD_RULE = { minLength: 8, maxLength: 72 };

export class RegisterDto extends EmailDto {
  @ApiProperty({
    enum: [AuthClient.WEB],
    enumName: 'AuthClient',
    description: 'Only the student web client can self-register',
  })
  @IsIn([AuthClient.WEB], { message: 'Only the web client can register' })
  client: AuthClient;

  @ApiProperty(PASSWORD_RULE)
  @IsString()
  @Length(PASSWORD_RULE.minLength, PASSWORD_RULE.maxLength)
  password: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  firstName: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  lastName?: string;
}

class CodeFields extends EmailDto {
  @ApiProperty({ example: '123456', pattern: '^\\d{6}$' })
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code: string;
}

export class VerifyEmailDto extends CodeFields {
  @ApiProperty({ enum: AuthClient, enumName: 'AuthClient' })
  @IsEnum(AuthClient)
  client: AuthClient;
}

export class ResetPasswordDto extends CodeFields {
  @ApiProperty(PASSWORD_RULE)
  @IsString()
  @Length(PASSWORD_RULE.minLength, PASSWORD_RULE.maxLength)
  newPassword: string;
}
