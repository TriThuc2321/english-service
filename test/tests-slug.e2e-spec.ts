import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
import { ExamType, TestStatus } from '../src/types/test.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo } from './utils/fixtures.js';

describe('Test slug', () => {
  let testApp: TestApp;
  let accessToken: string;

  const createTest = (body: Record<string, unknown>) =>
    testApp
      .http()
      .post('/api/tests')
      .auth(accessToken, { type: 'bearer' })
      .send({ examType: ExamType.IELTS_ACADEMIC, ...body });

  const updateTest = (id: number, body: Record<string, unknown>) =>
    testApp
      .http()
      .patch(`/api/tests/${id}`)
      .auth(accessToken, { type: 'bearer' })
      .send(body);

  beforeAll(async () => {
    testApp = await createTestApp();
    const user = await createUser(testApp, {
      permissions: [
        [PermissionAction.READ, PermissionSubject.TEST],
        [PermissionAction.CREATE, PermissionSubject.TEST],
        [PermissionAction.UPDATE, PermissionSubject.TEST],
        [PermissionAction.DELETE, PermissionSubject.TEST],
      ],
    });
    ({ accessToken } = await loginBo(testApp, user));
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('generates a unique slug from the title', async () => {
    const first = await createTest({ title: 'Đề thi IELTS 18 - Test 1' });
    const second = await createTest({ title: 'Đề thi IELTS 18 - Test 1' });

    expect(first.status).toBe(201);
    expect(first.body.slug).toBe('de-thi-ielts-18-test-1');
    expect(second.body.slug).toBe('de-thi-ielts-18-test-1-2');
  });

  it('rejects an invalid or taken slug', async () => {
    await createTest({ title: 'Taken', slug: 'taken-slug' }).expect(201);

    await createTest({ title: 'Other', slug: 'taken-slug' }).expect(409);
    await createTest({ title: 'Other', slug: 'Not A Slug' }).expect(400);
  });

  it('frees the slug of a deleted test', async () => {
    const res = await createTest({ title: 'Reused', slug: 'reused' });
    await testApp
      .http()
      .delete('/api/tests')
      .auth(accessToken, { type: 'bearer' })
      .send({ ids: [res.body.id] })
      .expect(200);

    await createTest({ title: 'Reused', slug: 'reused' }).expect(201);
  });

  it('allows changing the slug only until the test is published', async () => {
    const { body: test } = await createTest({ title: 'Draft slug' });

    const renamed = await updateTest(test.id, { slug: 'renamed' }).expect(200);
    expect(renamed.body.slug).toBe('renamed');

    await updateTest(test.id, { status: TestStatus.PUBLISHED }).expect(200);
    await updateTest(test.id, { slug: 'renamed-again' }).expect(400);
    await updateTest(test.id, { slug: 'renamed' }).expect(200);
  });
});
