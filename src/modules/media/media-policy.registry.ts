import { BadRequestException, Injectable } from '@nestjs/common';

import { MediaKind, MediaScope } from '../../types/media.type.js';
import { type IMediaOwnerPolicy } from './media-policy.js';

@Injectable()
export class MediaPolicyRegistry {
  private readonly policies = new Map<MediaScope, IMediaOwnerPolicy>();

  register(policy: IMediaOwnerPolicy) {
    if (this.policies.has(policy.scope)) {
      throw new Error(`Media policy for ${policy.scope} is already registered`);
    }
    if ([...this.policies.values()].some((p) => p.prefix === policy.prefix)) {
      throw new Error(`Media key prefix "${policy.prefix}" is already in use`);
    }
    this.policies.set(policy.scope, policy);
  }

  get(scope: MediaScope) {
    const policy = this.policies.get(scope);
    if (!policy) {
      throw new BadRequestException(`${scope} media is not supported`);
    }

    return policy;
  }

  getForKind(scope: MediaScope, kind: MediaKind) {
    const policy = this.get(scope);
    const maxBytes = policy.maxBytes[kind];
    if (maxBytes === undefined) {
      throw new BadRequestException(`${kind} is not allowed for ${scope}`);
    }

    return { policy, maxBytes };
  }
}
