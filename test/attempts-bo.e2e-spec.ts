import { randomUUID } from 'node:crypto';

import { AttemptMode } from '../src/types/attempt.type.js';
import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
import { ExamType, SkillType } from '../src/types/test.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo, loginWeb } from './utils/fixtures.js';
import { type ISeededExam, seedExam } from './utils/grading.js';

describe('Backoffice attempts', () => {
  let testApp: TestApp;
  let reader: string;
  let outsider: string;
  let alice: { id: string; email: string; token: string };
  let bob: { id: string; email: string; token: string };
  let ielts: ISeededExam;
  let toeic: ISeededExam;
  let aliceDone: string;
  let aliceOpen: string;
  let bobDone: string;

  const student = async () => {
    const user = await createUser(testApp);
    const { accessToken } = await loginWeb(testApp, user);
    return { id: user.id, email: user.email, token: accessToken };
  };

  const start = async (token: string, exam: ISeededExam) => {
    const section = exam.sections[SkillType.READING]!;
    const res = await testApp
      .http()
      .post('/api/student/attempts')
      .auth(token, { type: 'bearer' })
      .send({
        testId: exam.test.id,
        mode: AttemptMode.SECTION,
        sectionIds: [section.id],
      })
      .expect(201);
    return res.body.id as string;
  };

  const finish = async (token: string, exam: ISeededExam) => {
    const id = await start(token, exam);
    const [question] = exam.questions[SkillType.READING]!;
    await testApp
      .http()
      .put(`/api/student/attempts/${id}/answers`)
      .auth(token, { type: 'bearer' })
      .send({
        answers: [{ questionId: question.id, response: { key: 'A' } }],
      })
      .expect(200);
    await testApp
      .http()
      .post(`/api/student/attempts/${id}/submit`)
      .auth(token, { type: 'bearer' })
      .expect(201);
    return id;
  };

  const get = (path: string, token = reader) =>
    testApp.http().get(`/api/attempts${path}`).auth(token, { type: 'bearer' });

  const idsOf = (body: { data: Array<{ id: string }> }) =>
    body.data.map((a) => a.id).sort();

  beforeAll(async () => {
    testApp = await createTestApp();
    reader = (
      await loginBo(
        testApp,
        await createUser(testApp, {
          permissions: [[PermissionAction.READ, PermissionSubject.ASSESSMENT]],
        }),
      )
    ).accessToken;
    outsider = (
      await loginBo(
        testApp,
        await createUser(testApp, {
          permissions: [[PermissionAction.READ, PermissionSubject.TEST]],
        }),
      )
    ).accessToken;
    alice = await student();
    bob = await student();

    ielts = await seedExam(testApp, [SkillType.READING]);
    toeic = await seedExam(testApp, [SkillType.READING], {
      examType: ExamType.TOEIC_LR,
    });
    aliceDone = await finish(alice.token, ielts);
    aliceOpen = await start(alice.token, toeic);
    bobDone = await finish(bob.token, ielts);
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('lists the attempts of every student with who took them', async () => {
    const res = await get('').expect(200);

    expect(idsOf(res.body)).toEqual([aliceDone, aliceOpen, bobDone].sort());
    expect(res.body.meta.totalCount).toBe(3);
    const bobs = res.body.data.find((a: { id: string }) => a.id === bobDone);
    expect(bobs.student).toEqual({
      id: bob.id,
      email: bob.email,
      firstName: 'Test',
      lastName: null,
    });
    expect(bobs.sections[0]).toMatchObject({ rawScore: 1, maxScore: 1 });
  });

  it('filters by student, test, status, exam type and search', async () => {
    const cases: Array<[string, string[]]> = [
      [`?userId=${alice.id}`, [aliceDone, aliceOpen]],
      [`?testId=${ielts.test.id}`, [aliceDone, bobDone]],
      ['?status=IN_PROGRESS', [aliceOpen]],
      [`?examType=${ExamType.TOEIC_LR}`, [aliceOpen]],
      [`?search=${bob.email.slice(0, 20).toUpperCase()}`, [bobDone]],
      [`?userId=${randomUUID()}`, []],
    ];
    for (const [query, expected] of cases) {
      const res = await get(query).expect(200);
      expect({ query, ids: idsOf(res.body) }).toEqual({
        query,
        ids: expected.sort(),
      });
    }
  });

  it("returns another student's full review and test content", async () => {
    const result = await get(`/${bobDone}/result`).expect(200);

    expect(result.body.student.id).toBe(bob.id);
    expect(result.body.attempt.id).toBe(bobDone);
    expect(result.body.questions).toEqual([
      expect.objectContaining({
        isCorrect: true,
        answer: { key: 'A' },
        response: { key: 'A' },
      }),
    ]);

    const content = await get(`/${bobDone}/content`).expect(200);
    expect(content.body.id).toBe(ielts.test.id);
    expect(JSON.stringify(content.body)).not.toContain('"answer"');
  });

  it('refuses the review of an attempt still in progress', async () => {
    const res = await get(`/${aliceOpen}/result`).expect(409);
    expect(res.body.code).toBe('ATTEMPT_NOT_GRADED');
  });

  it('answers 404 for an unknown attempt', async () => {
    await get(`/${randomUUID()}/result`).expect(404);
    await get(`/${randomUUID()}/content`).expect(404);
  });

  it('requires READ on assessments and a backoffice token', async () => {
    await get('', outsider).expect(403);
    await get(`/${bobDone}/result`, outsider).expect(403);
    await get('', alice.token).expect(403);
  });
});
