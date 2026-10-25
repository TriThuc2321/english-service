import type { ExecutionContext, Type } from '@nestjs/common';

import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { CaslAbilityFactory } from '../../../shared/casl/casl-ability.factory.js';
import {
  AuthClient,
  type ITokenPayload,
  PermissionAction,
  PermissionSubject,
} from '../../../types/auth.type.js';
import { CheckPermissions } from '../decorators/check-permissions.decorator.js';
import { Clients } from '../decorators/clients.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import { PermissionGuard } from './permission.guard.js';

@Controller()
class OpenController {
  @Get()
  @Public()
  open() {}

  @Get()
  undecorated() {}

  @Get()
  @CheckPermissions()
  authenticated() {}

  @Get()
  @CheckPermissions([PermissionAction.READ, PermissionSubject.TEST])
  readTests() {}

  @Get()
  @CheckPermissions(
    [PermissionAction.READ, PermissionSubject.TEST],
    [PermissionAction.UPDATE, PermissionSubject.TEST],
  )
  editTests() {}
}

@Controller()
@Clients(AuthClient.BO)
class CmsController {
  @Get()
  @CheckPermissions()
  dashboard() {}

  @Get()
  @Public()
  open() {}
}

const user = (
  client: AuthClient,
  permissions: ITokenPayload['permissions'] = [],
): ITokenPayload => ({
  email: 'user@example.com',
  roleId: 1,
  id: 'user-id',
  client,
  permissions,
});

const readTest = {
  action: PermissionAction.READ,
  subject: PermissionSubject.TEST,
};

describe('PermissionGuard', () => {
  let guard: PermissionGuard;

  const context = <T>(
    controller: Type<T>,
    handler: keyof T,
    requestUser?: ITokenPayload,
  ) =>
    ({
      getClass: () => controller,
      getHandler: () => controller.prototype[handler],
      switchToHttp: () => ({ getRequest: () => ({ user: requestUser }) }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PermissionGuard, CaslAbilityFactory, Reflector],
    }).compile();
    guard = moduleRef.get(PermissionGuard);
  });

  it('allows @Public() handlers without a user', () => {
    expect(guard.canActivate(context(OpenController, 'open'))).toBe(true);
  });

  it('denies handlers without @Public() or @CheckPermissions()', () => {
    expect(
      guard.canActivate(
        context(OpenController, 'undecorated', user(AuthClient.BO)),
      ),
    ).toBe(false);
  });

  it('allows any authenticated user on @CheckPermissions() with no args', () => {
    expect(
      guard.canActivate(
        context(OpenController, 'authenticated', user(AuthClient.WEB)),
      ),
    ).toBe(true);
  });

  it('allows a user holding the required permission', () => {
    expect(
      guard.canActivate(
        context(OpenController, 'readTests', user(AuthClient.BO, [readTest])),
      ),
    ).toBe(true);
  });

  it('denies a user missing the required permission', () => {
    expect(
      guard.canActivate(
        context(OpenController, 'readTests', user(AuthClient.BO)),
      ),
    ).toBe(false);
  });

  it('requires every listed permission', () => {
    expect(
      guard.canActivate(
        context(OpenController, 'editTests', user(AuthClient.BO, [readTest])),
      ),
    ).toBe(false);
  });

  it('allows manage/all on any permission', () => {
    expect(
      guard.canActivate(
        context(
          OpenController,
          'editTests',
          user(AuthClient.BO, [
            {
              action: PermissionAction.MANAGE,
              subject: PermissionSubject.ALL,
            },
          ]),
        ),
      ),
    ).toBe(true);
  });

  it('rejects tokens from a client not listed in @Clients()', () => {
    expect(
      guard.canActivate(
        context(CmsController, 'dashboard', user(AuthClient.WEB)),
      ),
    ).toBe(false);
    expect(
      guard.canActivate(
        context(CmsController, 'dashboard', user(AuthClient.BO)),
      ),
    ).toBe(true);
  });

  it('lets @Public() bypass @Clients()', () => {
    expect(guard.canActivate(context(CmsController, 'open'))).toBe(true);
  });
});
