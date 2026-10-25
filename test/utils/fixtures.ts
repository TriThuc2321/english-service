import type { Response } from 'supertest';

import { hash } from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { In } from 'typeorm';

import type { TestApp } from './app.js';

import { AuthSession } from '../../src/entities/auth-session.entity.js';
import { Permission } from '../../src/entities/permission.entity.js';
import { Role } from '../../src/entities/role.entity.js';
import { User } from '../../src/entities/user.entity.js';
import { SystemRoleCode } from '../../src/modules/roles/roles.constant.js';
import {
  AuthClient,
  PermissionAction,
  PermissionSubject,
} from '../../src/types/auth.type.js';

export const PASSWORD = 'Passw0rd!';

interface ICreateUserOptions {
  roleCode?: SystemRoleCode;
  // Creates a dedicated CMS role holding exactly these permissions
  permissions?: Array<[PermissionAction, PermissionSubject]>;
  emailVerified?: boolean;
}

async function createRole(
  { dataSource }: TestApp,
  permissions: Array<[PermissionAction, PermissionSubject]>,
) {
  const found = await dataSource.getRepository(Permission).find({
    where: {
      action: In(permissions.map(([action]) => action)),
      subject: In(permissions.map(([, subject]) => subject)),
    },
  });
  const wanted = new Set(permissions.map(([a, s]) => `${a}:${s}`));

  return dataSource.getRepository(Role).save({
    name: 'Test role',
    code: `TEST_${randomUUID()}`,
    canAccessCms: true,
    permissions: found.filter((p) => wanted.has(`${p.action}:${p.subject}`)),
  });
}

export async function createUser(
  testApp: TestApp,
  {
    roleCode = SystemRoleCode.USER,
    permissions,
    emailVerified = true,
  }: ICreateUserOptions = {},
) {
  const role = permissions
    ? await createRole(testApp, permissions)
    : await testApp.dataSource
        .getRepository(Role)
        .findOneByOrFail({ code: roleCode });

  const email = `user-${randomUUID()}@example.com`;
  const user = await testApp.dataSource.getRepository(User).save({
    email,
    password: await hash(PASSWORD, 4),
    firstName: 'Test',
    emailVerified,
    roleId: role.id,
  });

  return { ...user, email, password: PASSWORD };
}

interface ICredentials {
  email: string;
  password: string;
}

export const login = (
  { http }: TestApp,
  client: AuthClient,
  { email, password }: ICredentials,
) => http().post('/api/auth/login').send({ client, email, password });

export function refreshCookie(res: Response) {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  return header?.find((c) => c.startsWith('refresh_token_bo='));
}

// The cookie is `secure`, so supertest won't replay it over plain http.
export const cookieHeader = (setCookie: string) => setCookie.split(';')[0];

export async function loginBo(testApp: TestApp, user: ICredentials) {
  const res = await login(testApp, AuthClient.BO, user).expect(201);
  return {
    accessToken: res.body.access_token as string,
    cookie: cookieHeader(refreshCookie(res)!),
  };
}

export async function loginWeb(testApp: TestApp, user: ICredentials) {
  const res = await login(testApp, AuthClient.WEB, user).expect(201);
  return {
    accessToken: res.body.access_token as string,
    refreshToken: res.body.refresh_token as string,
  };
}

export const sessionsOf = ({ dataSource }: TestApp, userId: string) =>
  dataSource
    .getRepository(AuthSession)
    .find({ where: { userId }, order: { expiresAt: 'ASC' } });
