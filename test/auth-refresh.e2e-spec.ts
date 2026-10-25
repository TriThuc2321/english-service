import { AuthSession } from '../src/entities/auth-session.entity.js';
import { SystemRoleCode } from '../src/modules/roles/roles.constant.js';
import { AuthClient, UserErrorEnum } from '../src/types/auth.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo, loginWeb, sessionsOf } from './utils/fixtures.js';

describe('POST /api/auth/refresh', () => {
  let testApp: TestApp;

  const refreshWeb = (refreshToken: string) =>
    testApp
      .http()
      .post('/api/auth/refresh')
      .send({ client: AuthClient.WEB, refreshToken });

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('rotates the session in place and slides its expiry', async () => {
    const user = await createUser(testApp);
    const first = await loginWeb(testApp, user);
    const [before] = await sessionsOf(testApp, user.id);

    const res = await refreshWeb(first.refreshToken).expect(201);

    expect(res.body.refresh_token).not.toBe(first.refreshToken);
    const sessions = await sessionsOf(testApp, user.id);
    expect(sessions).toHaveLength(1);
    const [after] = sessions;
    expect(after.id).toBe(before.id);
    expect(after.previousJti).toBe(before.currentJti);
    expect(after.currentJti).not.toBe(before.currentJti);
    expect(after.tokenHash).toBe(AuthSession.hash(res.body.refresh_token));
    expect(after.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before.expiresAt.getTime(),
    );
  });

  it('flags a concurrent refresh within the grace window without revoking', async () => {
    const user = await createUser(testApp);
    const { refreshToken } = await loginWeb(testApp, user);
    const rotated = await refreshWeb(refreshToken).expect(201);

    const res = await refreshWeb(refreshToken).expect(401);

    expect(res.body.code).toBe(UserErrorEnum.REFRESH_TOKEN_ROTATED);
    const [session] = await sessionsOf(testApp, user.id);
    expect(session.revokedAt).toBeNull();
    await refreshWeb(rotated.body.refresh_token).expect(201);
  });

  it('revokes every session of the user when a superseded token is replayed', async () => {
    const user = await createUser(testApp);
    const stolen = await loginWeb(testApp, user);
    const otherDevice = await loginWeb(testApp, user);
    await refreshWeb(stolen.refreshToken).expect(201);
    await testApp.dataSource
      .getRepository(AuthSession)
      .update(
        { userId: user.id },
        { rotatedAt: new Date(Date.now() - 60_000) },
      );

    const res = await refreshWeb(stolen.refreshToken).expect(401);

    expect(res.body.code).toBeUndefined();
    const sessions = await sessionsOf(testApp, user.id);
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.revokedAt)).toBe(true);
    await refreshWeb(otherDevice.refreshToken).expect(401);
  });

  it('rejects a token issued to another client', async () => {
    const user = await createUser(testApp, {
      roleCode: SystemRoleCode.ADMIN,
    });
    const { cookie } = await loginBo(testApp, user);

    await refreshWeb(cookie.split('=')[1]).expect(401);
  });

  it('rejects a garbage token', async () => {
    await refreshWeb('not-a-jwt').expect(401);
  });
});
