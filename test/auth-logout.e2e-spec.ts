import { SystemRoleCode } from '../src/modules/roles/roles.constant.js';
import { AuthClient } from '../src/types/auth.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import {
  createUser,
  loginBo,
  loginWeb,
  refreshCookie,
  sessionsOf,
} from './utils/fixtures.js';

describe('POST /api/auth/logout', () => {
  let testApp: TestApp;

  const logoutWeb = (refreshToken: string, allDevices?: boolean) =>
    testApp
      .http()
      .post('/api/auth/logout')
      .send({ client: AuthClient.WEB, refreshToken, allDevices });

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('revokes only the current session', async () => {
    const user = await createUser(testApp);
    const current = await loginWeb(testApp, user);
    const other = await loginWeb(testApp, user);

    await logoutWeb(current.refreshToken).expect(201);

    await testApp
      .http()
      .post('/api/auth/refresh')
      .send({ client: AuthClient.WEB, refreshToken: current.refreshToken })
      .expect(401);
    const sessions = await sessionsOf(testApp, user.id);
    expect(sessions.filter((s) => s.revokedAt)).toHaveLength(1);
    await testApp
      .http()
      .post('/api/auth/refresh')
      .send({ client: AuthClient.WEB, refreshToken: other.refreshToken })
      .expect(201);
  });

  it('revokes every session with allDevices', async () => {
    const user = await createUser(testApp, {
      roleCode: SystemRoleCode.ADMIN,
    });
    const web = await loginWeb(testApp, user);
    await loginBo(testApp, user);

    await logoutWeb(web.refreshToken, true).expect(201);

    const sessions = await sessionsOf(testApp, user.id);
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.revokedAt)).toBe(true);
  });

  it('is a no-op for an invalid token', async () => {
    await logoutWeb('not-a-jwt').expect(201);
  });

  it('identifies the bo session by cookie and clears it', async () => {
    const user = await createUser(testApp, {
      roleCode: SystemRoleCode.ADMIN,
    });
    const { cookie } = await loginBo(testApp, user);

    const res = await testApp
      .http()
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .send({ client: AuthClient.BO })
      .expect(201);

    expect(refreshCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    const [session] = await sessionsOf(testApp, user.id);
    expect(session.revokedAt).not.toBeNull();
  });
});
