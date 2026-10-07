import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  AppAbility,
  CaslAbilityFactory,
  PossibleAbilities,
} from '../../../shared/casl/casl-ability.factory.js';
import {
  IRequestWithUser,
  PermissionAction,
  PermissionSubject,
} from '../../../types/auth.type.js';
import { CHECK_PERMISSION_KEY } from '../decorators/check-permissions.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private caslAbilityFactory: CaslAbilityFactory,
  ) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.get<
      PossibleAbilities[] | undefined
    >(CHECK_PERMISSION_KEY, context.getHandler());

    if (!requiredPermissions) {
      return false;
    }

    const { user } = context.switchToHttp().getRequest<IRequestWithUser>();

    const ability = this.caslAbilityFactory.createForUser(user);

    return requiredPermissions.every((permission) =>
      this.isAllowed(ability, permission),
    );
  }

  private isAllowed(
    ability: AppAbility,
    permission: PossibleAbilities,
  ): boolean {
    return ability.can(...permission);
  }
}
