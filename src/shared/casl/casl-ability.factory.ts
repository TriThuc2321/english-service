import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
  MongoQuery,
} from '@casl/ability';
import { Injectable } from '@nestjs/common';

import {
  ITokenPayload,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';

export type PossibleAbilities = [PermissionAction, PermissionSubject];
type Conditions = MongoQuery;
export type AppAbility = MongoAbility<PossibleAbilities, Conditions>;

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: ITokenPayload) {
    const { can, build } = new AbilityBuilder(
      createMongoAbility<PossibleAbilities, Conditions>,
    );
    const permissions = user?.permissions ?? [];

    for (const permission of permissions) {
      can(permission.action, permission.subject);
    }

    return build();
  }
}
