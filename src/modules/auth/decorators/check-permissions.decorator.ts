import type { CustomDecorator } from '@nestjs/common';

import { SetMetadata } from '@nestjs/common';

import type { PossibleAbilities } from '../../../shared/casl/casl-ability.factory.js';

export const CHECK_PERMISSION_KEY = 'check_permission_key';

export const CheckPermissions = (
  ...params: PossibleAbilities[]
): CustomDecorator => SetMetadata(CHECK_PERMISSION_KEY, params);
