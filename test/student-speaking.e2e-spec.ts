import { randomUUID } from 'node:crypto';

import { AttemptMode } from '../src/types/attempt.type.js';
import { SkillType } from '../src/types/test.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginWeb } from './utils/fixtures.js';
import { seedExam } from './utils/grading.js';

const AUDIO = { size: 1024, contentType: 'audio/webm' };

describe('Student speaking attempts', () => {
  let testApp: TestApp;
  let token: string;
  let otherToken: string;

  const api = (jwt = token) => ({
    post: (path: string) =>
      testApp.http().post(`/api/student/attempts${path}`).auth(jwt, {
        type: 'bearer',
      }),
    put: (path: string) =>
      testApp.http().put(`/api/student/attempts${path}`).auth(jwt, {
        type: 'bearer',
      }),
    get: (path: string) =>
      testApp.http().get(`/api/student/attempts${path}`).auth(jwt, {
        type: 'bearer',
      }),
  });

  beforeAll(async () => {
    testApp = await createTestApp();
    ({ accessToken: token } = await loginWeb(
      testApp,
      await createUser(testApp),
    ));
    ({ accessToken: otherToken } = await loginWeb(
      testApp,
      await createUser(testApp),
    ));
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  beforeEach(() => {
    testApp.storage.head.mockReset();
    testApp.storage.delete.mockClear();
  });

  const startSection = async (skills: SkillType[], open: SkillType) => {
    const seeded = await seedExam(testApp, skills);
    const res = await api()
      .post('')
      .send({
        testId: seeded.test.id,
        mode: AttemptMode.SECTION,
        sectionIds: [seeded.sections[open]!.id],
      })
      .expect(201);
    return { ...seeded, id: res.body.id as string };
  };

  const startSpeaking = async () => {
    const started = await startSection(
      [SkillType.SPEAKING],
      SkillType.SPEAKING,
    );
    return { ...started, question: started.questions[SkillType.SPEAKING]![1] };
  };

  const uploadUrl = (
    id: string,
    questionId: number,
    extra: Record<string, unknown> = {},
    jwt = token,
  ) =>
    api(jwt)
      .post(`/${id}/audio/upload-url`)
      .send({ questionId, contentType: 'audio/webm', size: 1024, ...extra });

  const confirm = (
    id: string,
    questionId: number,
    storageKey: string,
    jwt = token,
  ) => api(jwt).post(`/${id}/audio`).send({ questionId, storageKey });

  const record = async (id: string, questionId: number) => {
    const url = await uploadUrl(id, questionId).expect(201);
    testApp.storage.head.mockResolvedValueOnce(AUDIO);
    const res = await confirm(id, questionId, url.body.storageKey).expect(201);
    return { storageKey: url.body.storageKey as string, answer: res.body };
  };

  const mediaRows = (id: string) =>
    testApp.dataSource.query(
      `SELECT media_id, scope, owner_id, storage_key FROM media WHERE owner_id = $1`,
      [id],
    );

  it('issues an upload URL', async () => {
    const { id, question } = await startSpeaking();

    const res = await uploadUrl(id, question.id).expect(201);

    expect(res.body.storageKey).toMatch(new RegExp(`^attempts/${id}/audio/`));
    expect(res.body.headers['Cache-Control']).toBe('private');
  });

  it('saves a recording', async () => {
    const { id, question } = await startSpeaking();

    const { storageKey, answer } = await record(id, question.id);

    const rows = await mediaRows(id);
    expect(rows).toEqual([
      expect.objectContaining({
        scope: 'ATTEMPT',
        owner_id: id,
        storage_key: storageKey,
      }),
    ]);
    expect(answer).toMatchObject({
      questionId: question.id,
      response: { mediaId: rows[0].media_id },
    });
  });

  it('re-recording deletes the previous media', async () => {
    const { id, question } = await startSpeaking();
    const first = await record(id, question.id);
    await testApp.dataSource.query(
      `UPDATE attempt_answers SET flagged = true WHERE attempt_id = $1`,
      [id],
    );

    const second = await record(id, question.id);

    const rows = await mediaRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].storage_key).toBe(second.storageKey);
    expect(testApp.storage.delete).toHaveBeenCalledWith(first.storageKey);
    expect(second.answer.flagged).toBe(true);
  });

  it("rejects another student's attempt", async () => {
    const { id, question } = await startSpeaking();
    const url = await uploadUrl(id, question.id).expect(201);

    await uploadUrl(id, question.id, {}, otherToken).expect(404);
    await confirm(id, question.id, url.body.storageKey, otherToken).expect(404);
  });

  it('rejects a Writing question', async () => {
    const { id, questions } = await startSection(
      [SkillType.WRITING, SkillType.SPEAKING],
      SkillType.WRITING,
    );

    await uploadUrl(id, questions[SkillType.WRITING]![1].id).expect(400);
  });

  it('rejects more than 20 MB up front', async () => {
    const { id, question } = await startSpeaking();

    await uploadUrl(id, question.id, { size: 20 * 1024 * 1024 + 1 }).expect(
      400,
    );
  });

  it.each([
    ['oversized', { size: 20 * 1024 * 1024 + 1, contentType: 'audio/webm' }],
    ['wrong type', { size: 1024, contentType: 'image/png' }],
  ])('rejects an %s object at confirm', async (_, object) => {
    const { id, question } = await startSpeaking();
    const url = await uploadUrl(id, question.id).expect(201);
    testApp.storage.head.mockResolvedValueOnce(object);

    await confirm(id, question.id, url.body.storageKey).expect(400);

    expect(testApp.storage.delete).toHaveBeenCalledWith(url.body.storageKey);
    expect(await mediaRows(id)).toEqual([]);
  });

  it('rejects a missing object', async () => {
    const { id, question } = await startSpeaking();
    const url = await uploadUrl(id, question.id).expect(201);
    testApp.storage.head.mockResolvedValueOnce(null);

    await confirm(id, question.id, url.body.storageKey).expect(400);
  });

  it('rejects a key from another attempt', async () => {
    const { id, question } = await startSpeaking();

    await confirm(
      id,
      question.id,
      `attempts/${randomUUID()}/audio/${randomUUID()}.webm`,
    ).expect(400);
  });

  it('rejects audio for a section that is not open', async () => {
    const seeded = await seedExam(testApp, [
      SkillType.WRITING,
      SkillType.SPEAKING,
    ]);
    const res = await api()
      .post('')
      .send({
        testId: seeded.test.id,
        mode: AttemptMode.SECTION,
        sectionIds: [
          seeded.sections[SkillType.WRITING]!.id,
          seeded.sections[SkillType.SPEAKING]!.id,
        ],
      })
      .expect(201);
    const id = res.body.id as string;
    const question = seeded.questions[SkillType.SPEAKING]![0];
    const url = await uploadUrl(id, question.id).expect(409);
    expect(url.body.code).toBe('SECTION_NOT_OPEN');

    const key = `attempts/${id}/audio/${randomUUID()}.webm`;
    const confirmed = await confirm(id, question.id, key).expect(409);
    expect(confirmed.body.code).toBe('SECTION_NOT_OPEN');

    const speaking = await startSpeaking();
    await api().post(`/${speaking.id}/submit`).expect(201);
    const closed = await confirm(
      speaking.id,
      speaking.question.id,
      `attempts/${speaking.id}/audio/${randomUUID()}.webm`,
    ).expect(409);
    expect(closed.body.code).toBe('ATTEMPT_CLOSED');
  });

  it('removes the new media when the section closes during confirm', async () => {
    const { id, sections, question } = await startSpeaking();
    const url = await uploadUrl(id, question.id).expect(201);
    testApp.storage.head.mockImplementationOnce(async () => {
      await api()
        .post(`/${id}/sections/${sections[SkillType.SPEAKING]!.id}/submit`)
        .expect(201);
      return AUDIO;
    });

    const res = await confirm(id, question.id, url.body.storageKey).expect(409);

    expect(res.body.code).toBe('ATTEMPT_CLOSED');
    expect(await mediaRows(id)).toEqual([]);
  });

  it('refuses autosave on Speaking, so a null cannot erase a recording', async () => {
    const { id, question } = await startSpeaking();
    await record(id, question.id);

    await api()
      .put(`/${id}/answers`)
      .send({
        answers: [{ questionId: question.id, response: null, flagged: true }],
      })
      .expect(400);

    const res = await api().get(`/${id}`).expect(200);
    expect(res.body.answers).toEqual([
      expect.objectContaining({
        questionId: question.id,
        response: { mediaId: expect.any(Number) },
      }),
    ]);
  });

  it('sends a recorded section to the queue', async () => {
    const { id, question } = await startSpeaking();
    await record(id, question.id);

    const res = await api().post(`/${id}/submit`).expect(201);

    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.sections[0].gradingStatus).toBe('PENDING');
  });

  it('auto-grades a section with no recordings at 0', async () => {
    const { id } = await startSpeaking();

    const res = await api().post(`/${id}/submit`).expect(201);

    expect(res.body.status).toBe('GRADED');
    expect(res.body.sections[0]).toMatchObject({
      gradingStatus: 'AUTO_GRADED',
      scaledScore: 0,
    });
  });
});
