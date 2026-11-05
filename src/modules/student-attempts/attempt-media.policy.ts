import {
  BadRequestException,
  ConflictException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';

import { Attempt } from '../../entities/attempt.entity.js';
import { AttemptStatus } from '../../types/attempt.type.js';
import { MediaKind, MediaScope } from '../../types/media.type.js';
import { type IMediaOwnerPolicy } from '../media/media-policy.js';
import { MediaPolicyRegistry } from '../media/media-policy.registry.js';
import { MB } from '../media/media.constant.js';

export const ATTEMPT_AUDIO_MAX_BYTES = 20 * MB;

@Injectable()
export class AttemptMediaPolicy implements IMediaOwnerPolicy, OnModuleInit {
  readonly scope = MediaScope.ATTEMPT;
  readonly prefix = 'attempts';
  readonly privateRead = true;
  readonly maxBytes = { [MediaKind.AUDIO]: ATTEMPT_AUDIO_MAX_BYTES };

  constructor(
    private registry: MediaPolicyRegistry,
    @InjectRepository(Attempt) private attemptRepository: Repository<Attempt>,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async assertOwnerWritable(ownerId?: string) {
    if (!ownerId || !isUUID(ownerId)) {
      throw new BadRequestException('Owner id must be an attempt id');
    }
    const open = await this.attemptRepository.existsBy({
      id: ownerId,
      status: AttemptStatus.IN_PROGRESS,
    });
    if (!open) {
      throw new ConflictException('The attempt is closed');
    }
  }
}
