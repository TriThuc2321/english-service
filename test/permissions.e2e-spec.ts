import { SystemRoleCode } from '../src/modules/roles/roles.constant.js';
import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo, loginWeb } from './utils/fixtures.js';

describe('guard chain', () => {
  let testApp: TestApp;

  const listTests = (accessToken?: string) => {
    const req = testApp.http().get('/api/tests');
    return accessToken ? req.auth(accessToken, { type: 'bearer' }) : req;
  };

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('rejects requests without a token', async () => {
    await listTests().expect(401);
  });

  it('rejects a forged token', async () => {
    await listTests('eyJhbGciOiJIUzI1NiJ9.e30.invalid').expect(401);
  });

  it('keeps web tokens out of CMS controllers', async () => {
    const user = await createUser(testApp, {
      permissions: [[PermissionAction.READ, PermissionSubject.TEST]],
    });
    const { accessToken } = await loginWeb(testApp, user);

    await listTests(accessToken).expect(403);
  });

  it('rejects a bo token whose role lacks the permission', async () => {
    const user = await createUser(testApp, {
      permissions: [[PermissionAction.READ, PermissionSubject.USER]],
    });
    const { accessToken } = await loginBo(testApp, user);

    await listTests(accessToken).expect(403);
  });

  it('allows a bo token whose role holds the permission', async () => {
    const user = await createUser(testApp, {
      permissions: [[PermissionAction.READ, PermissionSubject.TEST]],
    });
    const { accessToken } = await loginBo(testApp, user);

    const res = await listTests(accessToken).expect(200);

    expect(res.body).toMatchObject({ data: [] });
  });

  it('lets a CMS role with no permissions reach only unrestricted routes', async () => {
    const user = await createUser(testApp, {
      roleCode: SystemRoleCode.ADMIN,
    });
    const { accessToken } = await loginBo(testApp, user);

    await listTests(accessToken).expect(403);
    await testApp
      .http()
      .get('/api/auth/profile')
      .auth(accessToken, { type: 'bearer' })
      .expect(200);
  });
});
