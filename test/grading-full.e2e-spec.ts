import { ScoreScale } from '../src/entities/score-scale.entity.js';
import { TestPart } from '../src/entities/test-part.entity.js';
import { AttemptMode } from '../src/types/attempt.type.js';
import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
import { ExamType, SkillType } from '../src/types/test.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo, loginWeb } from './utils/fixtures.js';
import { backdateOpenSections, seedExam } from './utils/grading.js';

const AUDIO = { size: 1024, contentType: 'audio/webm' };
const ALL = [
  SkillType.LISTENING,
  SkillType.READING,
  SkillType.WRITING,
  SkillType.SPEAKING,
];

describe('FULL IELTS attempts with Writing and Speaking', () => {
  let testApp: TestApp;
  let student: string;
  let grader: string;
  let mediaReader: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    student = (await loginWeb(testApp, await createUser(testApp))).accessToken;
    grader = (
      await loginBo(
        testApp,
        await createUser(testApp, {
          permissions: [
            [PermissionAction.READ, PermissionSubject.ASSESSMENT],
            [PermissionAction.CREATE, PermissionSubject.ASSESSMENT],
          ],
        }),
      )
    ).accessToken;
    mediaReader = (
      await loginBo(
        testApp,
        await createUser(testApp, {
          permissions: [[PermissionAction.READ, PermissionSubject.MEDIA]],
        }),
      )
    ).accessToken;
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  const studentCall = (method: 'get' | 'post' | 'put', path: string) =>
    testApp.http()[method](`/api/student/attempts${path}`).auth(student, {
      type: 'bearer',
    });

  const gradeCall = (path: string, method: 'get' | 'post', body?: object) =>
    testApp
      .http()
      [method](`/api/grading${path}`)
      .auth(grader, {
        type: 'bearer',
      })
      .send(body);

  const seed = async () => {
    const seeded = await seedExam(testApp, ALL);
    const scale = (skill: SkillType, scaledScore: number) =>
      [0, 1].map((rawScore) => ({
        examType: ExamType.IELTS_ACADEMIC,
        skill,
        testId: seeded.test.id,
        rawScore,
        scaledScore,
      }));
    await testApp.dataSource
      .getRepository(ScoreScale)
      .save([
        ...scale(SkillType.LISTENING, 7),
        ...scale(SkillType.READING, 6.5),
      ]);
    return seeded;
  };

  const start = async (seeded: Awaited<ReturnType<typeof seed>>) => {
    const res = await studentCall('post', '')
      .send({ testId: seeded.test.id, mode: AttemptMode.FULL })
      .expect(201);
    return res.body.id as string;
  };

  const submitSection = (id: string, sectionId: number) =>
    studentCall('post', `/${id}/sections/${sectionId}/submit`).expect(201);

  const answer = (id: string, questionId: number, response: object) =>
    studentCall('put', `/${id}/answers`)
      .send({ answers: [{ questionId, response }] })
      .expect(200);

  const record = async (id: string, questionId: number) => {
    const url = await studentCall('post', `/${id}/audio/upload-url`)
      .send({ questionId, contentType: 'audio/webm', size: 1024 })
      .expect(201);
    testApp.storage.head.mockResolvedValueOnce(AUDIO);
    await studentCall('post', `/${id}/audio`)
      .send({ questionId, storageKey: url.body.storageKey })
      .expect(201);
  };

  const attemptSectionOf = async (id: string, skill: SkillType) => {
    const [row] = await testApp.dataSource.query(
      `SELECT s.attempt_section_id AS id, s.section_id
         FROM attempt_sections s
         JOIN test_sections ts ON ts.section_id = s.section_id
        WHERE s.attempt_id = $1 AND ts.skill = $2`,
      [id, skill],
    );
    return row as { id: string; section_id: number };
  };

  const runToSubmitted = async (seeded: Awaited<ReturnType<typeof seed>>) => {
    const id = await start(seeded);
    const { sections, questions } = seeded;
    await answer(id, questions[SkillType.LISTENING]![0].id, { key: 'A' });
    await submitSection(id, sections[SkillType.LISTENING]!.id);
    await answer(id, questions[SkillType.READING]![0].id, { key: 'A' });
    await submitSection(id, sections[SkillType.READING]!.id);
    for (const q of questions[SkillType.WRITING]!) {
      await answer(id, q.id, { text: 'An essay' });
    }
    await submitSection(id, sections[SkillType.WRITING]!.id);
    await record(id, questions[SkillType.SPEAKING]![1].id);
    await studentCall('post', `/${id}/submit`).expect(201);
    return id;
  };

  const writingBody = async (
    sectionId: number,
    task1: number[],
    task2: number[],
    expectedRevision = 0,
  ) => {
    const [part1, part2] = await testApp.dataSource
      .getRepository(TestPart)
      .find({ where: { sectionId }, order: { order: 'ASC' } });
    const [ta, cc, lr, gra] = task1;
    const [tr, cc2, lr2, gra2] = task2;
    return {
      expectedRevision,
      entries: [
        { partId: part1.id, criteria: { TA: ta, CC: cc, LR: lr, GRA: gra } },
        {
          partId: part2.id,
          criteria: { TR: tr, CC: cc2, LR: lr2, GRA: gra2 },
        },
      ],
    };
  };

  const speakingBody = (scores: number[], expectedRevision = 0) => ({
    expectedRevision,
    entries: [
      {
        partId: null,
        criteria: {
          FC: scores[0],
          LR: scores[1],
          GRA: scores[2],
          P: scores[3],
        },
      },
    ],
  });

  const result = async (id: string) =>
    (await studentCall('get', `/${id}/result`).expect(200)).body;

  const scaledOf = (
    body: {
      attempt: { sections: Array<{ skill: string; scaledScore: number }> };
    },
    skill: SkillType,
  ) => body.attempt.sections.find((s) => s.skill === skill)?.scaledScore;

  it('runs a FULL attempt to its overall score', async () => {
    const seeded = await seed();
    const id = await runToSubmitted(seeded);
    const writing = await attemptSectionOf(id, SkillType.WRITING);
    const speaking = await attemptSectionOf(id, SkillType.SPEAKING);

    let body = await result(id);
    expect(body.attempt.sections).toHaveLength(4);
    expect(body.attempt.status).toBe('SUBMITTED');
    expect(scaledOf(body, SkillType.LISTENING)).toBe(7);
    expect(scaledOf(body, SkillType.READING)).toBe(6.5);
    expect(body.attempt.overallScore).toBeNull();

    const written = await gradeCall(
      `/sections/${writing.id}/assessments`,
      'post',
      await writingBody(writing.section_id, [7, 7, 7, 7], [6, 7, 6, 7]),
    ).expect(201);
    expect(written.body.band).toBe(6.5);
    body = await result(id);
    expect(body.attempt.overallScore).toBeNull();
    expect(body.attempt.status).toBe('SUBMITTED');

    const spoken = await gradeCall(
      `/sections/${speaking.id}/assessments`,
      'post',
      speakingBody([6, 7, 6, 7]),
    ).expect(201);
    expect(spoken.body.band).toBe(6.5);
    body = await result(id);
    expect(body.attempt.overallScore).toBe(6.5);
    expect(body.attempt.status).toBe('GRADED');
    expect(
      body.assessments.map(
        (a: { attemptSectionId: string }) => a.attemptSectionId,
      ),
    ).toEqual([writing.id, speaking.id]);
  });

  it('updates the overall score on a correction', async () => {
    const seeded = await seed();
    const id = await runToSubmitted(seeded);
    const writing = await attemptSectionOf(id, SkillType.WRITING);
    const speaking = await attemptSectionOf(id, SkillType.SPEAKING);
    await gradeCall(
      `/sections/${writing.id}/assessments`,
      'post',
      await writingBody(writing.section_id, [7, 7, 7, 7], [6, 7, 6, 7]),
    ).expect(201);
    await gradeCall(
      `/sections/${speaking.id}/assessments`,
      'post',
      speakingBody([6, 7, 6, 7]),
    ).expect(201);

    await gradeCall(
      `/sections/${speaking.id}/assessments`,
      'post',
      speakingBody([8, 8, 8, 8], 1),
    ).expect(201);

    expect((await result(id)).attempt.overallScore).toBe(7);
    const history = await gradeCall(
      `/sections/${speaking.id}/assessments`,
      'get',
    ).expect(200);
    expect(history.body.map((a: { revision: number }) => a.revision)).toEqual([
      2, 1,
    ]);
  });

  it('computes the overall score at finish when Writing and Speaking are blank', async () => {
    const seeded = await seed();
    const id = await start(seeded);

    const res = await studentCall('post', `/${id}/submit`).expect(201);

    expect(res.body.status).toBe('GRADED');
    expect(res.body.overallScore).toBe(3.5);
  });

  it('shows recordings through signed URLs', async () => {
    const seeded = await seed();
    const id = await runToSubmitted(seeded);
    const speaking = await attemptSectionOf(id, SkillType.SPEAKING);
    const question = seeded.questions[SkillType.SPEAKING]![1];

    const body = await result(id);
    const graded = await gradeCall(`/sections/${speaking.id}`, 'get').expect(
      200,
    );

    const resultQuestions = body.questions as Array<{
      questionId: number;
      audioUrl: string | null;
    }>;
    expect(resultQuestions.find((q) => q.questionId === question.id)).toEqual(
      expect.objectContaining({
        audioUrl: expect.stringMatching(/^http:\/\/signed\.test\/attempts\//),
      }),
    );
    expect(
      resultQuestions
        .filter((q) => q.questionId !== question.id)
        .every((q) => q.audioUrl === null),
    ).toBe(true);
    const gradedQuestion = graded.body.parts
      .flatMap((p: { questions: unknown[] }) => p.questions)
      .find((q: { questionId: number }) => q.questionId === question.id);
    expect(gradedQuestion.response).toEqual({
      text: null,
      wordCount: null,
      audioUrl: expect.stringMatching(/^http:\/\/signed\.test\/attempts\//),
    });
  });

  it('never exposes a public URL for attempt audio', async () => {
    const seeded = await seed();
    const id = await runToSubmitted(seeded);
    const speaking = await attemptSectionOf(id, SkillType.SPEAKING);
    testApp.storage.getPublicUrl.mockClear();

    const media = await testApp
      .http()
      .get('/api/media')
      .query({ scope: 'ATTEMPT', ownerId: id })
      .auth(mediaReader, { type: 'bearer' })
      .expect(200);
    const graded = await gradeCall(`/sections/${speaking.id}`, 'get').expect(
      200,
    );
    const body = await result(id);

    for (const payload of [body, graded.body, media.body]) {
      expect(JSON.stringify(payload)).not.toContain(
        'http://storage.test/attempts/',
      );
    }
    expect(JSON.stringify(media.body)).toContain(
      'http://signed.test/attempts/',
    );
    expect(
      testApp.storage.getPublicUrl.mock.calls.filter(([key]) =>
        String(key).startsWith('attempts/'),
      ),
    ).toEqual([]);
  });

  it('survives a deleted recording', async () => {
    const seeded = await seed();
    const id = await runToSubmitted(seeded);
    const speaking = await attemptSectionOf(id, SkillType.SPEAKING);
    const question = seeded.questions[SkillType.SPEAKING]![1];
    await testApp.dataSource.query(
      `UPDATE attempt_answers SET response = response WHERE attempt_id = $1`,
      [id],
    );
    await testApp.dataSource.query(`DELETE FROM media WHERE owner_id = $1`, [
      id,
    ]);

    const body = await result(id);
    const graded = await gradeCall(`/sections/${speaking.id}`, 'get').expect(
      200,
    );

    expect(
      body.questions.find(
        (q: { questionId: number }) => q.questionId === question.id,
      ).audioUrl,
    ).toBeNull();
    const gradedQuestion = graded.body.parts
      .flatMap((p: { questions: unknown[] }) => p.questions)
      .find((q: { questionId: number }) => q.questionId === question.id);
    expect(gradedQuestion.response).toEqual({
      text: null,
      wordCount: null,
      audioUrl: null,
    });
  });

  it('reaches the queue after timing out in Speaking', async () => {
    const seeded = await seed();
    const id = await start(seeded);
    const { sections, questions } = seeded;
    await submitSection(id, sections[SkillType.LISTENING]!.id);
    await submitSection(id, sections[SkillType.READING]!.id);
    await submitSection(id, sections[SkillType.WRITING]!.id);
    await record(id, questions[SkillType.SPEAKING]![1].id);
    await backdateOpenSections(testApp, id);

    const attempt = await studentCall('get', `/${id}`).expect(200);

    expect(attempt.body.status).toBe('EXPIRED');
    const queue = await gradeCall('/queue', 'get').expect(200);
    const speaking = await attemptSectionOf(id, SkillType.SPEAKING);
    expect(
      queue.body.data.map(
        (i: { attemptSectionId: string }) => i.attemptSectionId,
      ),
    ).toContain(speaking.id);
  });
});
