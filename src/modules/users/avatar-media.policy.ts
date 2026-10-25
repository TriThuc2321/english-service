import {
  BadRequestException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { User } from '../../entities/user.entity.js';
import { Status } from '../../types/common.type.js';
import { MediaKind, MediaScope } from '../../types/media.type.js';
import { type IMediaOwnerPolicy } from '../media/media-policy.js';
import { MediaPolicyRegistry } from '../media/media-policy.registry.js';
import { MB } from '../media/media.constant.js';

const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

@Injectable()
export class AvatarMediaPolicy implements IMediaOwnerPolicy, OnModuleInit {
  readonly scope = MediaScope.AVATAR;
  readonly prefix = 'avatars';
  readonly maxBytes = { [MediaKind.IMAGE]: 2 * MB };

  constructor(
    private registry: MediaPolicyRegistry,
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async assertOwnerWritable(ownerId?: string) {
    if (!ownerId || !USER_ID_PATTERN.test(ownerId)) {
      throw new BadRequestException('Owner id must be a user id');
    }
    const exists = await this.userRepository.existsBy({
      id: ownerId,
      status: Not(Status.DELETED),
    });
    if (!exists) {
      throw new NotFoundException(`User with ID ${ownerId} not found`);
    }
  }
}
