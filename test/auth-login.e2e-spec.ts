import { SystemRoleCode } from '../src/modules/roles/roles.constant.js';
import { AuthClient, UserErrorEnum } from '../src/types/auth.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import {
  createUser,
  login,
  loginBo,
  loginWeb,
  refreshCookie,
  sessionsOf,
} from './utils/fixtures.js';

describe('POST /api/auth/login', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('gives the bo client an access token and an httpOnly refresh cookie', async () => {
    const user = await createUser(testApp, {
      roleCode: SystemRoleCode.ADMIN,
    });

    const res = await login(testApp, AuthClient.BO, user).expect(201);

    expect(Object.keys(res.body)).toEqual(['access_token']);
    const cookie = refreshCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(await sessionsOf(testApp, user.id)).toHaveLength(1);
  });

  it('gives the web client both tokens in the body', async () => {
    const user = await createUser(testApp);

    const res = await login(testApp, AuthClient.WEB, user).expect(201);

    expect(res.body).toEqual({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      refresh_token_expires_at: expect.any(String),
    });
    expect(refreshCookie(res)).toBeUndefined();
  });

  it('answers a wrong password and an unknown email the same way', async () => {
    const user = await createUser(testApp);

    const wrongPassword = await login(testApp, AuthClient.WEB, {
      email: user.email,
      password: 'wrong-password',
    }).expect(401);
    const unknownEmail = await login(testApp, AuthClient.WEB, {
      email: 'nobody@example.com',
      password: 'wrong-password',
    }).expect(401);

    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('rejects an unverified email', async () => {
    const user = await createUser(testApp, { emailVerified: false });

    const res = await login(testApp, AuthClient.WEB, user).expect(403);

    expect(res.body.code).toBe(UserErrorEnum.EMAIL_NOT_VERIFIED);
  });

  it('keeps users without CMS access out of the bo client', async () => {
    const user = await createUser(testApp, { roleCode: SystemRoleCode.USER });

    const res = await login(testApp, AuthClient.BO, user).expect(403);

    expect(res.body.code).toBe(UserErrorEnum.CMS_ACCESS_DENIED);
    expect(await sessionsOf(testApp, user.id)).toHaveLength(0);
  });

  it('rejects an unknown client', async () => {
    const user = await createUser(testApp);

    await testApp
      .http()
      .post('/api/auth/login')
      .send({ client: 'mobile', email: user.email, password: user.password })
      .expect(400);
  });

  describe('GET /api/auth/profile', () => {
    it('requires an access token', async () => {
      await testApp.http().get('/api/auth/profile').expect(401);
    });

    it('returns the logged-in user', async () => {
      const user = await createUser(testApp, {
        roleCode: SystemRoleCode.ADMIN,
      });
      const { accessToken } = await loginBo(testApp, user);

      const res = await testApp
        .http()
        .get('/api/auth/profile')
        .auth(accessToken, { type: 'bearer' })
        .expect(200);

      expect(res.body).toMatchObject({ id: user.id, email: user.email });
      expect(res.body.password).toBeUndefined();
    });

    it('works for web tokens too', async () => {
      const user = await createUser(testApp);
      const { accessToken } = await loginWeb(testApp, user);

      await testApp
        .http()
        .get('/api/auth/profile')
        .auth(accessToken, { type: 'bearer' })
        .expect(200);
    });
  });
});
