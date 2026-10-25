import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
import { MediaScope } from '../src/types/media.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo } from './utils/fixtures.js';

describe('GET /media', () => {
  let testApp: TestApp;
  let accessToken: string;

  const listMedia = (query = '') =>
    testApp
      .http()
      .get(`/api/media${query}`)
      .auth(accessToken, { type: 'bearer' });

  beforeAll(async () => {
    testApp = await createTestApp();
    const user = await createUser(testApp, {
      permissions: [[PermissionAction.READ, PermissionSubject.MEDIA]],
    });
    ({ accessToken } = await loginBo(testApp, user));
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  // TypeORM 1.x throws on undefined where values instead of skipping them
  it('lists without any filter', async () => {
    const res = await listMedia().expect(200);

    expect(res.body.meta.totalCount).toBe(0);
  });

  it('lists with only some filters', async () => {
    await listMedia(`?scope=${MediaScope.TEST}`).expect(200);
  });
});
