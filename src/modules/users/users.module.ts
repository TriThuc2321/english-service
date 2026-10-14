import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Role } from '../../entities/role.entity.js';
import { User } from '../../entities/user.entity.js';
import { MediaModule } from '../media/media.module.js';
import { AvatarMediaPolicy } from './avatar-media.policy.js';
import { MeController } from './me.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, MeController],
  providers: [UsersService, AvatarMediaPolicy],
  exports: [UsersService],
  imports: [TypeOrmModule.forFeature([User, Role]), MediaModule],
})
export class UsersModule {}
