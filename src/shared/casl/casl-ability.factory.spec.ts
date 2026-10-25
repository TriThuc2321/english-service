import {
  AuthClient,
  type ITokenPayload,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { CaslAbilityFactory } from './casl-ability.factory.js';

const payload = (permissions: ITokenPayload['permissions']): ITokenPayload => ({
  email: 'user@example.com',
  roleId: 1,
  id: 'user-id',
  client: AuthClient.BO,
  permissions,
});

describe('CaslAbilityFactory', () => {
  const factory = new CaslAbilityFactory();

  it('grants only the permissions in the payload', () => {
    const ability = factory.createForUser(
      payload([
        { action: PermissionAction.READ, subject: PermissionSubject.TEST },
      ]),
    );

    expect(ability.can(PermissionAction.READ, PermissionSubject.TEST)).toBe(
      true,
    );
    expect(ability.can(PermissionAction.UPDATE, PermissionSubject.TEST)).toBe(
      false,
    );
    expect(ability.can(PermissionAction.READ, PermissionSubject.USER)).toBe(
      false,
    );
  });

  it('treats manage/all as a wildcard', () => {
    const ability = factory.createForUser(
      payload([
        { action: PermissionAction.MANAGE, subject: PermissionSubject.ALL },
      ]),
    );

    expect(ability.can(PermissionAction.DELETE, PermissionSubject.ROLE)).toBe(
      true,
    );
  });

  it('denies everything without a user', () => {
    const ability = factory.createForUser(
      undefined as unknown as ITokenPayload,
    );

    expect(ability.can(PermissionAction.READ, PermissionSubject.TEST)).toBe(
      false,
    );
  });
});
