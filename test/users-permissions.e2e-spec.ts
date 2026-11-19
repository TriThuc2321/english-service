import { Role } from '../src/entities/role.entity.js';
import { User } from '../src/entities/user.entity.js';
import { SystemRoleCode } from '../src/modules/roles/roles.constant.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo } from './utils/fixtures.js';

describe('user management permissions', () => {
  let testApp: TestApp;
  let adminToken: string;
  let superAdminToken: string;
  let admin: Awaited<ReturnType<typeof createUser>>;
  const roleIds = new Map<SystemRoleCode, number>();

  const patchUser = (token: string, id: string, body: object) =>
    testApp
      .http()
      .patch(`/api/users/${id}`)
      .auth(token, { type: 'bearer' })
      .send(body);

  const userRow = (id: string) =>
    testApp.dataSource.getRepository(User).findOneOrFail({
      where: { id },
      select: { id: true, roleId: true, email: true, password: true },
    });

  beforeAll(async () => {
    testApp = await createTestApp();
    for (const role of await testApp.dataSource.getRepository(Role).find()) {
      roleIds.set(role.code as SystemRoleCode, role.id);
    }
    admin = await createUser(testApp, { roleCode: SystemRoleCode.ADMIN });
    const superAdmin = await createUser(testApp, {
      roleCode: SystemRoleCode.SUPER_ADMIN,
    });
    ({ accessToken: adminToken } = await loginBo(testApp, admin));
    ({ accessToken: superAdminToken } = await loginBo(testApp, superAdmin));
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('refuses an admin promoting themselves to super admin', async () => {
    await patchUser(adminToken, admin.id, {
      roleId: roleIds.get(SystemRoleCode.SUPER_ADMIN),
    }).expect(403);

    expect((await userRow(admin.id)).roleId).toBe(
      roleIds.get(SystemRoleCode.ADMIN),
    );
  });

  it('refuses an admin creating a super admin', async () => {
    await testApp
      .http()
      .post('/api/users')
      .auth(adminToken, { type: 'bearer' })
      .send({
        email: 'escalate@example.com',
        firstName: 'Escalate',
        roleId: roleIds.get(SystemRoleCode.SUPER_ADMIN),
      })
      .expect(403);
  });

  it('refuses an admin editing or deleting a super admin', async () => {
    const target = await createUser(testApp, {
      roleCode: SystemRoleCode.SUPER_ADMIN,
    });

    await patchUser(adminToken, target.id, { status: 'INACTIVE' }).expect(403);
    await testApp
      .http()
      .delete('/api/users')
      .auth(adminToken, { type: 'bearer' })
      .send({ ids: [target.id] })
      .expect(403);
  });

  it('keeps system users out of reach of admins', async () => {
    const target = await createUser(testApp, { roleCode: SystemRoleCode.USER });
    await testApp.dataSource
      .getRepository(User)
      .update(target.id, { systemUser: true });

    await patchUser(adminToken, target.id, { firstName: 'Renamed' }).expect(
      403,
    );
    await patchUser(superAdminToken, target.id, {
      firstName: 'Renamed',
    }).expect(200);
  });

  it('lets an admin manage users within their own permissions', async () => {
    const target = await createUser(testApp, { roleCode: SystemRoleCode.USER });

    await patchUser(adminToken, target.id, {
      roleId: roleIds.get(SystemRoleCode.TEACHER),
    }).expect(200);

    expect((await userRow(target.id)).roleId).toBe(
      roleIds.get(SystemRoleCode.TEACHER),
    );
  });

  it('lets a super admin assign the super admin role', async () => {
    const target = await createUser(testApp, { roleCode: SystemRoleCode.USER });

    await patchUser(superAdminToken, target.id, {
      roleId: roleIds.get(SystemRoleCode.SUPER_ADMIN),
    }).expect(200);
  });

  it('ignores fields the DTO does not declare', async () => {
    const target = await createUser(testApp, { roleCode: SystemRoleCode.USER });
    const before = await userRow(target.id);

    await patchUser(adminToken, target.id, {
      firstName: 'Renamed',
      password: '$2b$04$attackerControlledHashattackerControlledHashxx',
      email: 'hijacked@example.com',
    }).expect(200);

    const after = await userRow(target.id);
    expect(after.password).toBe(before.password);
    expect(after.email).toBe(before.email);
  });
});
