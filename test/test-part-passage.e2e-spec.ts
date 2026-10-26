import { GroupPassage } from '../src/entities/group-passage.entity.js';
import { Passage, PassageStatus } from '../src/entities/passage.entity.js';
import { QuestionGroup } from '../src/entities/question-group.entity.js';
import { TestPart } from '../src/entities/test-part.entity.js';
import { TestSection } from '../src/entities/test-section.entity.js';
import { Test } from '../src/entities/test.entity.js';
import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
import { ExamType, QuestionType, SkillType } from '../src/types/test.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo } from './utils/fixtures.js';

describe('Test part passage', () => {
  let testApp: TestApp;
  let accessToken: string;

  const createPassage = (title = 'Passage') =>
    testApp.dataSource.getRepository(Passage).save({ title });

  const createSection = async () => {
    const test = await testApp.dataSource.getRepository(Test).save({
      examType: ExamType.IELTS_ACADEMIC,
      title: 'Cambridge 18 - Test 1',
    });
    const section = await testApp.dataSource
      .getRepository(TestSection)
      .save({ testId: test.id, skill: SkillType.READING, order: 0 });

    return { test, section };
  };

  const lock = (test: Test) =>
    testApp.dataSource
      .getRepository(Test)
      .update(test.id, { lockedAt: new Date() });

  const updatePassage = (id: number) =>
    testApp
      .http()
      .patch(`/api/passages/${id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ title: 'Renamed' });

  beforeAll(async () => {
    testApp = await createTestApp();
    const user = await createUser(testApp, {
      permissions: [
        [PermissionAction.READ, PermissionSubject.TEST],
        [PermissionAction.CREATE, PermissionSubject.TEST],
        [PermissionAction.UPDATE, PermissionSubject.TEST],
        [PermissionAction.UPDATE, PermissionSubject.PASSAGE],
        [PermissionAction.DELETE, PermissionSubject.PASSAGE],
      ],
    });
    ({ accessToken } = await loginBo(testApp, user));
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('sets, returns and clears the passage of a part', async () => {
    const passage = await createPassage('The Lost City');
    const { section } = await createSection();

    const created = await testApp
      .http()
      .post('/api/test-parts')
      .auth(accessToken, { type: 'bearer' })
      .send({
        sectionId: section.id,
        title: 'Passage 1',
        passageId: passage.id,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      passageId: passage.id,
      passage: { id: passage.id, title: 'The Lost City', subtitle: null },
    });

    const list = await testApp
      .http()
      .get(`/api/test-parts?sectionId=${section.id}`)
      .auth(accessToken, { type: 'bearer' })
      .expect(200);
    expect(list.body[0].passage.id).toBe(passage.id);

    const cleared = await testApp
      .http()
      .patch(`/api/test-parts/${created.body.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ passageId: null })
      .expect(200);

    expect(cleared.body).toMatchObject({ passageId: null, passage: null });
  });

  it('rejects a deleted or unknown passage', async () => {
    const deleted = await testApp.dataSource
      .getRepository(Passage)
      .save({ title: 'Gone', status: PassageStatus.DELETED });
    const { section } = await createSection();

    for (const passageId of [deleted.id, 999_999]) {
      await testApp
        .http()
        .post('/api/test-parts')
        .auth(accessToken, { type: 'bearer' })
        .send({ sectionId: section.id, passageId })
        .expect(400);
    }
  });

  it('blocks editing a passage used by a locked test through a part', async () => {
    const passage = await createPassage();
    const { test, section } = await createSection();
    await testApp.dataSource
      .getRepository(TestPart)
      .save({ sectionId: section.id, order: 0, passageId: passage.id });

    await updatePassage(passage.id).expect(200);
    await lock(test);
    await updatePassage(passage.id).expect(400);
    await testApp
      .http()
      .delete('/api/passages')
      .auth(accessToken, { type: 'bearer' })
      .send({ ids: [passage.id] })
      .expect(400);
  });

  it('blocks editing a passage used by a locked test through a group', async () => {
    const passage = await createPassage();
    const free = await createPassage();
    const { test, section } = await createSection();
    const part = await testApp.dataSource
      .getRepository(TestPart)
      .save({ sectionId: section.id, order: 0 });
    const group = await testApp.dataSource.getRepository(QuestionGroup).save({
      partId: part.id,
      order: 0,
      questionType: QuestionType.TRUE_FALSE_NOT_GIVEN,
    });
    await testApp.dataSource
      .getRepository(GroupPassage)
      .save({ groupId: group.id, passageId: passage.id });
    await lock(test);

    await updatePassage(passage.id).expect(400);
    await updatePassage(free.id).expect(200);
  });
});
