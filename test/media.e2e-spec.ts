import { randomUUID } from 'node:crypto';

import { Media } from '../src/entities/media.entity.js';
import { User } from '../src/entities/user.entity.js';
import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
import { MediaKind, MediaScope } from '../src/types/media.type.js';
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

describe('DELETE /media/:id', () => {
  let testApp: TestApp;
  let accessToken: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    const user = await createUser(testApp, {
      permissions: [[PermissionAction.DELETE, PermissionSubject.MEDIA]],
    });
    ({ accessToken } = await loginBo(testApp, user));
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('returns 409 when the media is a user avatar', async () => {
    const owner = await createUser(testApp);
    const media = await testApp.dataSource.getRepository(Media).save({
      scope: MediaScope.AVATAR,
      ownerId: owner.id,
      kind: MediaKind.IMAGE,
      storageKey: `avatars/${owner.id}/IMAGE/${randomUUID()}.png`,
      auditMetadata: {},
    });
    await testApp.dataSource
      .getRepository(User)
      .update(owner.id, { avatarMediaId: media.id });

    await testApp
      .http()
      .delete(`/api/media/${media.id}`)
      .auth(accessToken, { type: 'bearer' })
      .expect(409);
  });
});

describe('POST /media/upload-url', () => {
  let testApp: TestApp;
  let accessToken: string;

  const createUploadUrl = (body: object) =>
    testApp
      .http()
      .post('/api/media/upload-url')
      .auth(accessToken, { type: 'bearer' })
      .send(body);

  beforeAll(async () => {
    testApp = await createTestApp();
    const user = await createUser(testApp, {
      permissions: [[PermissionAction.CREATE, PermissionSubject.MEDIA]],
    });
    ({ accessToken } = await loginBo(testApp, user));
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('issues an owner-less key for library media', async () => {
    const res = await createUploadUrl({
      scope: MediaScope.LIBRARY,
      kind: MediaKind.AUDIO,
      contentType: 'audio/mpeg',
    }).expect(201);

    expect(res.body.storageKey).toMatch(/^library\/audio\/[0-9a-f-]{36}\.mp3$/);
  });

  it('rejects an owner for library media', async () => {
    await createUploadUrl({
      scope: MediaScope.LIBRARY,
      ownerId: '1',
      kind: MediaKind.AUDIO,
      contentType: 'audio/mpeg',
    }).expect(400);
  });

  it('still requires an owner for test media', async () => {
    await createUploadUrl({
      scope: MediaScope.TEST,
      kind: MediaKind.AUDIO,
      contentType: 'audio/mpeg',
    }).expect(400);
  });
});
