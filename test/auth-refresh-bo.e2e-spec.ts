import { SystemRoleCode } from '../src/modules/roles/roles.constant.js';
import { AuthClient } from '../src/types/auth.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import {
  cookieHeader,
  createUser,
  loginBo,
  refreshCookie,
} from './utils/fixtures.js';

// Separate from auth-refresh.e2e-spec.ts to stay under the 10/min auth throttle
describe('POST /api/auth/refresh (bo cookie)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('reads the cookie and sets a rotated one', async () => {
    const user = await createUser(testApp, {
      roleCode: SystemRoleCode.ADMIN,
    });
    const { cookie } = await loginBo(testApp, user);

    const res = await testApp
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .send({ client: AuthClient.BO })
      .expect(201);

    expect(Object.keys(res.body)).toEqual(['access_token']);
    const rotated = refreshCookie(res);
    expect(rotated).toBeDefined();
    expect(cookieHeader(rotated!)).not.toBe(cookie);
  });

  it('clears the cookie when the refresh fails', async () => {
    const res = await testApp
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token_bo=not-a-jwt')
      .send({ client: AuthClient.BO })
      .expect(401);

    expect(refreshCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
