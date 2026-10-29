import type { Response } from 'supertest';

import { randomUUID } from 'node:crypto';

import { AttemptAnswer } from '../src/entities/attempt-answer.entity.js';
import { AttemptSection } from '../src/entities/attempt-section.entity.js';
import { Attempt } from '../src/entities/attempt.entity.js';
import { Media } from '../src/entities/media.entity.js';
import { QuestionGroup } from '../src/entities/question-group.entity.js';
import { Question } from '../src/entities/question.entity.js';
import { TestPart } from '../src/entities/test-part.entity.js';
import { TestSection } from '../src/entities/test-section.entity.js';
import { Test } from '../src/entities/test.entity.js';
import {
  AttemptMode,
  AttemptSectionStatus,
  AttemptStatus,
} from '../src/types/attempt.type.js';
import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
import { MediaKind, MediaScope } from '../src/types/media.type.js';
import {
  ExamType,
  QuestionType,
  SkillType,
  TestStatus,
} from '../src/types/test.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo, loginWeb } from './utils/fixtures.js';

const HIDDEN_KEYS = ['answer', 'explanation', 'evidence', 'transcript'];

function collectKeys(value: unknown, keys = new Set<string>()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

const OPTIONS = { options: ['A', 'B', 'C', 'D', 'E'].map((key) => ({ key })) };

interface ISeededIelts {
  test: Test;
  listening: TestSection;
  reading: TestSection;
  mcq: Question;
  form: Question;
  multi: Question;
}

interface ISeededToeic {
  test: Test;
  listening: Question;
  reading: Question;
}

describe('Student attempts', () => {
  let testApp: TestApp;
  let webToken: string;
  let otherToken: string;
  let boToken: string;
  const responses: Response[] = [];

  const track = <T extends Response>(res: T) => {
    responses.push(res);
    return res;
  };

  const createTest = (overrides: Partial<Test> = {}) =>
    testApp.dataSource.getRepository(Test).save({
      examType: ExamType.IELTS_ACADEMIC,
      title: 'Attempt test',
      slug: `attempt-test-${randomUUID()}`,
      status: TestStatus.PUBLISHED,
      publishedAt: new Date(),
      ...overrides,
    });

  const createGroup = async (
    sectionId: number,
    questionType: QuestionType,
    wordLimit?: number,
  ) => {
    const part = await testApp.dataSource
      .getRepository(TestPart)
      .save({ sectionId, order: 0 });
    return testApp.dataSource
      .getRepository(QuestionGroup)
      .save({ partId: part.id, order: 0, questionType, wordLimit });
  };

  const createQuestion = (fields: Partial<Question>) =>
    testApp.dataSource.getRepository(Question).save({ order: 0, ...fields });

  const seedIelts = async (
    overrides: Partial<Test> = {},
  ): Promise<ISeededIelts> => {
    const test = await createTest(overrides);
    const [listening, reading] = await testApp.dataSource
      .getRepository(TestSection)
      .save([
        {
          testId: test.id,
          skill: SkillType.LISTENING,
          order: 0,
          durationMinutes: 30,
        },
        {
          testId: test.id,
          skill: SkillType.READING,
          order: 1,
          durationMinutes: 60,
        },
      ]);
    const mcqGroup = await createGroup(
      listening.id,
      QuestionType.MULTIPLE_CHOICE,
    );
    const formGroup = await createGroup(
      listening.id,
      QuestionType.FORM_COMPLETION,
      1,
    );
    const multiGroup = await createGroup(
      reading.id,
      QuestionType.MULTIPLE_CHOICE_MULTI,
    );
    const mcq = await createQuestion({
      groupId: mcqGroup.id,
      numberFrom: 1,
      numberTo: 1,
      content: OPTIONS,
      answer: { key: 'B' },
      explanation: 'Said at 0:42',
    });
    const form = await createQuestion({
      groupId: formGroup.id,
      numberFrom: 2,
      numberTo: 2,
      answer: { accepted: ['colour'] },
    });
    const multi = await createQuestion({
      groupId: multiGroup.id,
      numberFrom: 3,
      numberTo: 4,
      content: OPTIONS,
      answer: { keys: ['A', 'D'] },
      evidence: { quote: 'somewhere' },
    });
    return { test, listening, reading, mcq, form, multi };
  };

  const seedToeic = async (): Promise<ISeededToeic> => {
    const test = await createTest({
      examType: ExamType.TOEIC_LR,
      durationMinutes: 120,
    });
    const [l, r] = await testApp.dataSource.getRepository(TestSection).save([
      {
        testId: test.id,
        skill: SkillType.LISTENING,
        order: 0,
        durationMinutes: 45,
      },
      {
        testId: test.id,
        skill: SkillType.READING,
        order: 1,
        durationMinutes: 75,
      },
    ]);
    const [listening, reading] = await Promise.all(
      [l, r].map(async (section, i) =>
        createQuestion({
          groupId: (await createGroup(section.id, QuestionType.MULTIPLE_CHOICE))
            .id,
          numberFrom: i + 1,
          numberTo: i + 1,
          content: OPTIONS,
          answer: { key: 'A' },
        }),
      ),
    );
    return { test, listening, reading };
  };

  const start = (testId: number, token = webToken, mode = AttemptMode.FULL) =>
    testApp
      .http()
      .post('/api/student/attempts')
      .auth(token, { type: 'bearer' })
      .send({ testId, mode });

  const get = (id: string, token = webToken) =>
    testApp
      .http()
      .get(`/api/student/attempts/${id}`)
      .auth(token, { type: 'bearer' });

  const save = (
    id: string,
    answers: Array<{
      questionId: number;
      response: unknown;
      flagged?: boolean;
    }>,
  ) =>
    testApp
      .http()
      .put(`/api/student/attempts/${id}/answers`)
      .auth(webToken, { type: 'bearer' })
      .send({ answers });

  const submitSection = (id: string, sectionId: number) =>
    testApp
      .http()
      .post(`/api/student/attempts/${id}/sections/${sectionId}/submit`)
      .auth(webToken, { type: 'bearer' });

  const submit = (id: string) =>
    testApp
      .http()
      .post(`/api/student/attempts/${id}/submit`)
      .auth(webToken, { type: 'bearer' });

  const result = (id: string, token = webToken) =>
    testApp
      .http()
      .get(`/api/student/attempts/${id}/result`)
      .auth(token, { type: 'bearer' });

  const answersOf = (attemptId: string) =>
    testApp.dataSource
      .getRepository(AttemptAnswer)
      .find({ where: { attemptId }, order: { questionId: 'ASC' } });

  const backdateOpenSections = (attemptId: string) =>
    testApp.dataSource.query(
      `UPDATE attempt_sections
          SET started_at = now() - interval '3 hours',
              deadline_at = now() - interval '150 minutes'
        WHERE attempt_id = $1 AND status = 'IN_PROGRESS'`,
      [attemptId],
    );

  const storedAttempt = async (id: string) => ({
    attempt: await testApp.dataSource
      .getRepository(Attempt)
      .findOneByOrFail({ id }),
    sections: await testApp.dataSource
      .getRepository(AttemptSection)
      .find({ where: { attemptId: id }, relations: { testSection: true } }),
  });

  beforeAll(async () => {
    testApp = await createTestApp();
    ({ accessToken: webToken } = await loginWeb(
      testApp,
      await createUser(testApp),
    ));
    ({ accessToken: otherToken } = await loginWeb(
      testApp,
      await createUser(testApp),
    ));
    ({ accessToken: boToken } = await loginBo(
      testApp,
      await createUser(testApp, {
        permissions: [[PermissionAction.READ, PermissionSubject.TEST]],
      }),
    ));
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('starts an IELTS attempt, locks the test and rejects a second start', async () => {
    const { test, listening, reading } = await seedIelts();

    const res = track(await start(test.id).expect(201));

    expect(res.body).toMatchObject({
      testId: test.id,
      testSlug: test.slug,
      mode: AttemptMode.FULL,
      status: AttemptStatus.IN_PROGRESS,
      deadlineAt: null,
      submittedAt: null,
      overallScore: null,
      answers: [],
      sections: [
        {
          sectionId: listening.id,
          skill: SkillType.LISTENING,
          order: 0,
          status: AttemptSectionStatus.IN_PROGRESS,
          submittedAt: null,
          rawScore: null,
        },
        {
          sectionId: reading.id,
          skill: SkillType.READING,
          order: 1,
          status: AttemptSectionStatus.NOT_STARTED,
          startedAt: null,
          deadlineAt: null,
        },
      ],
    });
    expect(typeof res.body.serverNow).toBe('string');
    const [l] = res.body.sections;
    expect(
      new Date(l.deadlineAt).getTime() - new Date(l.startedAt).getTime(),
    ).toBe(30 * 60_000);

    const locked = await testApp.dataSource
      .getRepository(Test)
      .findOneByOrFail({ id: test.id });
    expect(locked.lockedAt).not.toBeNull();

    const again = await start(test.id).expect(409);
    expect(again.body).toMatchObject({
      code: 'ATTEMPT_IN_PROGRESS',
      attemptId: res.body.id,
    });
  });

  it('lets only one of two concurrent starts through', async () => {
    const { test } = await seedIelts();

    const results = await Promise.all([start(test.id), start(test.id)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const created = results.find((r) => r.status === 201)!;
    const rejected = results.find((r) => r.status === 409)!;
    expect(rejected.body).toMatchObject({
      code: 'ATTEMPT_IN_PROGRESS',
      attemptId: created.body.id,
    });
  });

  it('hides drafts, other clients and other users', async () => {
    const draft = await seedIelts({ status: TestStatus.DRAFT });
    const draftRes = await start(draft.test.id).expect(404);
    expect(draftRes.body.code).toBe('TEST_NOT_FOUND');

    const { test } = await seedIelts();
    await start(test.id, boToken).expect(403);

    const res = await start(test.id).expect(201);
    const other = await get(res.body.id, otherToken).expect(404);
    expect(other.body.code).toBe('ATTEMPT_NOT_FOUND');
  });

  it('runs an IELTS attempt section by section and grades it', async () => {
    const { test, listening, reading, mcq, form, multi } = await seedIelts();
    const { body: attempt } = track(await start(test.id).expect(201));

    const closed = await save(attempt.id, [
      { questionId: multi.id, response: { keys: ['A'] } },
    ]).expect(409);
    expect(closed.body.code).toBe('SECTION_NOT_OPEN');
    await save(attempt.id, [
      { questionId: mcq.id, response: { key: 'Z' } },
    ]).expect(400);

    const saved = track(
      await save(attempt.id, [
        { questionId: mcq.id, response: { key: 'B' } },
        { questionId: form.id, response: { text: 'Colour' }, flagged: true },
      ]).expect(200),
    );
    expect(typeof saved.body.savedAt).toBe('string');
    expect(typeof saved.body.serverNow).toBe('string');

    const resumed = track(await get(attempt.id).expect(200));
    expect(resumed.body.answers).toEqual([
      expect.objectContaining({
        questionId: mcq.id,
        response: { key: 'B' },
        flagged: false,
      }),
      expect.objectContaining({
        questionId: form.id,
        response: { text: 'Colour' },
        flagged: true,
      }),
    ]);
    expect(resumed.body.answers[0].answeredAt).not.toBeNull();

    await save(attempt.id, [
      { questionId: form.id, response: { text: 'Colour' } },
    ]).expect(200);
    const [, keptFlag] = await answersOf(attempt.id);
    expect(keptFlag.flagged).toBe(true);

    const afterListening = track(
      await submitSection(attempt.id, listening.id).expect(201),
    );
    expect(afterListening.body.status).toBe(AttemptStatus.IN_PROGRESS);
    expect(
      afterListening.body.sections.map((s: { status: string }) => s.status),
    ).toEqual([
      AttemptSectionStatus.SUBMITTED,
      AttemptSectionStatus.IN_PROGRESS,
    ]);
    const again = await submitSection(attempt.id, listening.id).expect(409);
    expect(again.body.code).toBe('SECTION_NOT_OPEN');

    track(
      await save(attempt.id, [
        { questionId: multi.id, response: { keys: ['A', 'C'] } },
      ]).expect(200),
    );

    const graded = await submitSection(attempt.id, reading.id).expect(201);
    expect(graded.body).toMatchObject({
      status: AttemptStatus.GRADED,
      overallScore: null,
      sections: [
        {
          sectionId: listening.id,
          status: AttemptSectionStatus.SUBMITTED,
          rawScore: 2,
          maxScore: 2,
          scaledScore: 2,
        },
        {
          sectionId: reading.id,
          status: AttemptSectionStatus.SUBMITTED,
          rawScore: 1,
          maxScore: 2,
          scaledScore: 1,
        },
      ],
    });
    expect(graded.body.submittedAt).not.toBeNull();
    expect(collectKeys(graded.body).has('isCorrect')).toBe(false);
    expect(collectKeys(graded.body).has('score')).toBe(false);
  });

  it('grades a TOEIC attempt submitted with no answers', async () => {
    const { test } = await seedToeic();
    const { body: attempt } = track(await start(test.id).expect(201));
    expect(attempt.deadlineAt).not.toBeNull();
    expect(attempt.sections.map((s: { status: string }) => s.status)).toEqual([
      AttemptSectionStatus.IN_PROGRESS,
      AttemptSectionStatus.IN_PROGRESS,
    ]);

    const res = await submit(attempt.id).expect(201);

    expect(res.body).toMatchObject({
      status: AttemptStatus.GRADED,
      overallScore: 10,
      sections: [
        { rawScore: 0, maxScore: 1, scaledScore: 5 },
        { rawScore: 0, maxScore: 1, scaledScore: 5 },
      ],
    });
    const rows = await answersOf(attempt.id);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ score: 0, isCorrect: null, response: null });
    }
  });

  it('adds TOEIC listening and reading into the overall score', async () => {
    const { test, listening, reading } = await seedToeic();
    const { body: attempt } = await start(test.id).expect(201);

    await save(attempt.id, [
      { questionId: listening.id, response: { key: 'A' } },
      { questionId: reading.id, response: { key: 'A' } },
    ]).expect(200);
    const res = await submit(attempt.id).expect(201);

    expect(res.body).toMatchObject({
      status: AttemptStatus.GRADED,
      overallScore: 20,
      sections: [
        { rawScore: 1, scaledScore: 10 },
        { rawScore: 1, scaledScore: 10 },
      ],
    });
  });

  it('expires every overdue IELTS section on read and closes later writes', async () => {
    const { test, mcq } = await seedIelts();
    const { body: attempt } = await start(test.id).expect(201);
    await save(attempt.id, [
      { questionId: mcq.id, response: { key: 'B' } },
    ]).expect(200);
    await backdateOpenSections(attempt.id);

    const res = await get(attempt.id).expect(200);

    expect(res.body).toMatchObject({
      status: AttemptStatus.EXPIRED,
      sections: [
        { status: AttemptSectionStatus.EXPIRED, rawScore: 1, maxScore: 2 },
        { status: AttemptSectionStatus.EXPIRED, rawScore: 0, maxScore: 2 },
      ],
    });
    const [l, r] = res.body.sections;
    expect(r.startedAt).toBe(l.deadlineAt);
    expect(res.body.submittedAt).toBe(r.deadlineAt);

    const closed = await save(attempt.id, [
      { questionId: mcq.id, response: { key: 'A' } },
    ]).expect(409);
    expect(closed.body.code).toBe('ATTEMPT_CLOSED');
    expect(await answersOf(attempt.id)).toHaveLength(3);
  });

  it('grades only once when submitted twice at the same time', async () => {
    const { test } = await seedIelts();
    const { body: attempt } = await start(test.id).expect(201);

    const results = await Promise.all([submit(attempt.id), submit(attempt.id)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe(
      'ATTEMPT_CLOSED',
    );
    expect(await answersOf(attempt.id)).toHaveLength(3);
  });

  it('paginates history by attempt, not by attempt section', async () => {
    const { test } = await seedToeic();
    const { body: first } = await start(test.id).expect(201);
    await submit(first.id).expect(201);
    await start(test.id).expect(201);

    const pages = await Promise.all(
      [1, 2].map(async (page) =>
        track(
          await testApp
            .http()
            .get(`/api/student/attempts?testId=${test.id}&take=1&page=${page}`)
            .auth(webToken, { type: 'bearer' })
            .expect(200),
        ),
      ),
    );

    for (const res of pages) {
      expect(res.body.meta.totalCount).toBe(2);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].sections).toHaveLength(2);
    }
    expect(pages[0].body.data[0].id).not.toBe(pages[1].body.data[0].id);
  });

  it('lists attempts newest first without answers', async () => {
    const { test } = await seedToeic();
    const { body: first } = await start(test.id).expect(201);
    await submit(first.id).expect(201);
    const { body: second } = await start(test.id).expect(201);

    const res = track(
      await testApp
        .http()
        .get(`/api/student/attempts?testId=${test.id}`)
        .auth(webToken, { type: 'bearer' })
        .expect(200),
    );

    expect(res.body.meta).toMatchObject({ page: 1, totalCount: 2 });
    expect(res.body.data.map((a: { id: string }) => a.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(res.body.data[1]).toMatchObject({
      status: AttemptStatus.GRADED,
      testId: test.id,
      testSlug: test.slug,
      test: {
        id: test.id,
        slug: test.slug,
        title: test.title,
        examType: ExamType.TOEIC_LR,
      },
      sections: [{ skill: SkillType.LISTENING }, { skill: SkillType.READING }],
    });
    for (const item of res.body.data) {
      expect(item).not.toHaveProperty('answers');
      expect(item).not.toHaveProperty('serverNow');
    }

    const filtered = await testApp
      .http()
      .get(
        `/api/student/attempts?testId=${test.id}&status=${AttemptStatus.GRADED}`,
      )
      .auth(webToken, { type: 'bearer' })
      .expect(200);
    expect(filtered.body.data.map((a: { id: string }) => a.id)).toEqual([
      first.id,
    ]);
  });

  it('returns scores and the full review of a graded attempt', async () => {
    const { test, listening, mcq, form, multi } = await seedIelts();
    const [withTranscript, withoutTranscript] = await testApp.dataSource
      .getRepository(Media)
      .save(
        [
          { transcript: 'hello', storageKey: `tests/${randomUUID()}/a.mp3` },
          { transcript: null, storageKey: `tests/${randomUUID()}/b.mp3` },
        ].map((m) => ({
          ...m,
          scope: MediaScope.TEST,
          kind: MediaKind.AUDIO,
        })),
      );
    const mcqGroup = await testApp.dataSource
      .getRepository(QuestionGroup)
      .findOneByOrFail({ id: mcq.groupId });
    await testApp.dataSource
      .getRepository(TestPart)
      .update(mcqGroup.partId, { audioMediaId: withTranscript.id });
    await testApp.dataSource
      .getRepository(Question)
      .update(form.id, { audioMediaId: withoutTranscript.id });

    const { body: attempt } = await start(test.id).expect(201);
    const notGraded = await result(attempt.id).expect(409);
    expect(notGraded.body.code).toBe('ATTEMPT_NOT_GRADED');
    await result(attempt.id, otherToken).expect(404);
    await save(attempt.id, [
      { questionId: mcq.id, response: { key: 'B' } },
      { questionId: form.id, response: { text: 'red' } },
    ]).expect(200);
    await submitSection(attempt.id, listening.id).expect(201);
    await save(attempt.id, [
      { questionId: multi.id, response: { keys: ['A', 'C'] } },
    ]).expect(200);
    await submit(attempt.id).expect(201);

    const res = await result(attempt.id).expect(200);

    expect(res.body.attempt).toMatchObject({
      id: attempt.id,
      status: AttemptStatus.GRADED,
      test: { id: test.id, slug: test.slug },
    });
    expect(res.body.questions).toEqual([
      {
        questionId: mcq.id,
        sectionId: listening.id,
        numberFrom: 1,
        numberTo: 1,
        response: { key: 'B' },
        isCorrect: true,
        score: 1,
        maxScore: 1,
        flagged: false,
        answer: { key: 'B' },
        explanation: 'Said at 0:42',
        evidence: null,
      },
      expect.objectContaining({
        questionId: form.id,
        numberFrom: 2,
        isCorrect: false,
        score: 0,
        answer: { accepted: ['colour'] },
        explanation: null,
      }),
      expect.objectContaining({
        questionId: multi.id,
        numberFrom: 3,
        response: { keys: ['A', 'C'] },
        isCorrect: false,
        score: 1,
        maxScore: 2,
        evidence: { quote: 'somewhere' },
      }),
    ]);
    expect(res.body.transcripts).toEqual([
      { mediaId: withTranscript.id, transcript: 'hello' },
    ]);
  });

  it('expires an overdue attempt on /result and returns its review', async () => {
    const { test, mcq } = await seedIelts();
    const { body: attempt } = await start(test.id).expect(201);
    await save(attempt.id, [
      { questionId: mcq.id, response: { key: 'B' } },
    ]).expect(200);
    await backdateOpenSections(attempt.id);

    const res = await result(attempt.id).expect(200);

    expect(res.body.attempt.status).toBe(AttemptStatus.EXPIRED);
    expect(res.body.questions[0]).toMatchObject({
      questionId: mcq.id,
      isCorrect: true,
      answer: { key: 'B' },
    });
  });

  it('returns 404 for an unknown attempt id', async () => {
    const id = randomUUID();
    for (const res of [await get(id), await result(id)]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ATTEMPT_NOT_FOUND');
    }
  });

  it('expires an overdue attempt on autosave and rejects the write', async () => {
    const { test, mcq } = await seedIelts();
    const { body: attempt } = await start(test.id).expect(201);
    await save(attempt.id, [
      { questionId: mcq.id, response: { key: 'B' } },
    ]).expect(200);
    await backdateOpenSections(attempt.id);

    const closed = await save(attempt.id, [
      { questionId: mcq.id, response: { key: 'A' } },
    ]).expect(409);

    expect(closed.body.code).toBe('ATTEMPT_CLOSED');
    const stored = await storedAttempt(attempt.id);
    expect(stored.attempt.status).toBe(AttemptStatus.EXPIRED);
    expect(stored.attempt.submittedAt).not.toBeNull();
    const bySkill = Object.fromEntries(
      stored.sections.map((s) => [s.testSection.skill, s]),
    );
    expect(bySkill[SkillType.LISTENING]).toMatchObject({
      status: AttemptSectionStatus.EXPIRED,
      rawScore: 1,
      maxScore: 2,
    });
    expect(bySkill[SkillType.READING]).toMatchObject({
      status: AttemptSectionStatus.EXPIRED,
      rawScore: 0,
      maxScore: 2,
    });
    const mcqRow = (await answersOf(attempt.id)).find(
      (a) => a.questionId === mcq.id,
    );
    expect(mcqRow?.response).toEqual({ key: 'B' });
  });

  it('starts a retake when the open attempt has already run out', async () => {
    const { test, mcq } = await seedIelts();
    const { body: old } = await start(test.id).expect(201);
    await save(old.id, [{ questionId: mcq.id, response: { key: 'B' } }]).expect(
      200,
    );
    await backdateOpenSections(old.id);

    const res = track(await start(test.id).expect(201));

    expect(res.body.id).not.toBe(old.id);
    expect(res.body.status).toBe(AttemptStatus.IN_PROGRESS);
    const stored = await storedAttempt(old.id);
    expect(stored.attempt.status).toBe(AttemptStatus.EXPIRED);
    for (const section of stored.sections) {
      expect(section.status).toBe(AttemptSectionStatus.EXPIRED);
      expect(section.rawScore).not.toBeNull();
    }
    expect(stored.sections.map((s) => s.rawScore).sort()).toEqual([0, 1]);
  });

  it('serializes an autosave racing a submit', async () => {
    const { test, mcq } = await seedIelts();
    const { body: attempt } = await start(test.id).expect(201);

    const [saved, submitted] = await Promise.all([
      save(attempt.id, [{ questionId: mcq.id, response: { key: 'B' } }]),
      submit(attempt.id),
    ]);

    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe(AttemptStatus.GRADED);
    expect([200, 409]).toContain(saved.status);
    if (saved.status === 409) {
      expect(saved.body.code).toBe('ATTEMPT_CLOSED');
    }
    const rows = await answersOf(attempt.id);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.questionId)).size).toBe(3);
    const mcqRow = rows.find((r) => r.questionId === mcq.id);
    expect(mcqRow?.score).toBe(saved.status === 200 ? 1 : 0);
  });

  it('runs a SECTION attempt on one IELTS section only', async () => {
    const { test, reading, mcq, multi } = await seedIelts();
    const listeningAudio = await testApp.dataSource.getRepository(Media).save({
      transcript: 'listening script',
      storageKey: `tests/${randomUUID()}/l.mp3`,
      scope: MediaScope.TEST,
      kind: MediaKind.AUDIO,
    });
    const mcqGroup = await testApp.dataSource
      .getRepository(QuestionGroup)
      .findOneByOrFail({ id: mcq.groupId });
    await testApp.dataSource
      .getRepository(TestPart)
      .update(mcqGroup.partId, { audioMediaId: listeningAudio.id });

    const { body: attempt } = track(
      await testApp
        .http()
        .post('/api/student/attempts')
        .auth(webToken, { type: 'bearer' })
        .send({
          testId: test.id,
          mode: AttemptMode.SECTION,
          sectionIds: [reading.id],
        })
        .expect(201),
    );

    expect(attempt).toMatchObject({
      mode: AttemptMode.SECTION,
      status: AttemptStatus.IN_PROGRESS,
      sections: [
        { sectionId: reading.id, status: AttemptSectionStatus.IN_PROGRESS },
      ],
    });
    expect(attempt.sections).toHaveLength(1);
    const [r] = attempt.sections;
    expect(
      new Date(r.deadlineAt).getTime() - new Date(r.startedAt).getTime(),
    ).toBe(60 * 60_000);
    await save(attempt.id, [
      { questionId: mcq.id, response: { key: 'B' } },
    ]).expect(400);
    await save(attempt.id, [
      { questionId: multi.id, response: { keys: ['A', 'D'] } },
    ]).expect(200);

    const graded = await submit(attempt.id).expect(201);
    expect(graded.body).toMatchObject({
      status: AttemptStatus.GRADED,
      sections: [{ sectionId: reading.id, rawScore: 2, maxScore: 2 }],
    });

    const res = await result(attempt.id).expect(200);
    expect(res.body.transcripts).toEqual([]);
    expect(
      res.body.questions.map((q: { sectionId: number }) => q.sectionId),
    ).toEqual([reading.id]);
  });

  it('never exposes answer keys, explanations, evidence or transcripts', () => {
    expect(responses.length).toBeGreaterThan(0);
    for (const res of responses) {
      const keys = collectKeys(res.body);
      for (const hidden of HIDDEN_KEYS) {
        expect(keys.has(hidden)).toBe(false);
      }
    }
  });
});
