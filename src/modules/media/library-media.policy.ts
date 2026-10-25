import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

import { MediaKind, MediaScope } from '../../types/media.type.js';
import { type IMediaOwnerPolicy } from './media-policy.js';
import { MediaPolicyRegistry } from './media-policy.registry.js';
import { MB } from './media.constant.js';

// Shared media uploaded from the media library; any test can reference it
@Injectable()
export class LibraryMediaPolicy implements IMediaOwnerPolicy, OnModuleInit {
  readonly scope = MediaScope.LIBRARY;
  readonly prefix = 'library';
  readonly maxBytes = {
    [MediaKind.AUDIO]: 100 * MB,
    [MediaKind.IMAGE]: 10 * MB,
  };

  constructor(private registry: MediaPolicyRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  assertOwnerWritable(ownerId?: string) {
    if (ownerId) {
      throw new BadRequestException('Library media has no owner');
    }
    return Promise.resolve();
  }
}
