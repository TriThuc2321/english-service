import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

import { MediaKind, MediaScope } from '../../types/media.type.js';
import { type IMediaOwnerPolicy } from '../media/media-policy.js';
import { MediaPolicyRegistry } from '../media/media-policy.registry.js';
import { MB } from '../media/media.constant.js';
import { TestsService } from './tests.service.js';

const TEST_ID_PATTERN = /^[1-9]\d{0,9}$/;

@Injectable()
export class TestMediaPolicy implements IMediaOwnerPolicy, OnModuleInit {
  readonly scope = MediaScope.TEST;
  readonly prefix = 'tests';
  readonly maxBytes = {
    [MediaKind.AUDIO]: 100 * MB,
    [MediaKind.IMAGE]: 10 * MB,
  };

  constructor(
    private registry: MediaPolicyRegistry,
    private testsService: TestsService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async assertOwnerWritable(ownerId: string) {
    if (!TEST_ID_PATTERN.test(ownerId)) {
      throw new BadRequestException('Owner id must be a test id');
    }
    await this.testsService.findEditableTest(Number(ownerId));
  }
}
