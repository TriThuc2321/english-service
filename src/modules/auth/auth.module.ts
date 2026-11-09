import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { jwtConfig, type JWTConfig } from '../../configs/jwt.config.js';
import { AuthSession } from '../../entities/auth-session.entity.js';
import { EmailCode } from '../../entities/email-code.entity.js';
import { Role } from '../../entities/role.entity.js';
import { User } from '../../entities/user.entity.js';
import { MailModule } from '../../shared/mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailCodeService } from './email-code.service.js';
import { GoogleStrategy } from './strategies/google.strategy.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, EmailCodeService, JwtStrategy, GoogleStrategy],
  exports: [AuthService],
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [jwtConfig.KEY],
      useFactory: (jwt: JWTConfig) => ({
        secret: jwt.secret,
        signOptions: {
          expiresIn: jwt.expiresIn,
        },
      }),
    }),
    TypeOrmModule.forFeature([User, Role, AuthSession, EmailCode]),
  ],
})
export class AuthModule {}
