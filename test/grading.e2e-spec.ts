import { Assessment } from '../src/entities/assessment.entity.js';
import { Media } from '../src/entities/media.entity.js';
import { QuestionGroup } from '../src/entities/question-group.entity.js';
import { Question } from '../src/entities/question.entity.js';
import { TestPart } from '../src/entities/test-part.entity.js';
import { TestSection } from '../src/entities/test-section.entity.js';
import { AttemptMode } from '../src/types/attempt.type.js';
import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
import { MediaKind, MediaScope } from '../src/types/media.type.js';
import { SkillType } from '../src/types/test.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo, loginWeb } from './utils/fixtures.js';
import { backdateOpenSections, seedExam } from './utils/grading.js';

describe('Grading', () => {
  let testApp: TestApp;
  let student: string;
  let grader: string;
  let reader: string;

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
    reader = (
      await loginBo(
        testApp,
        await createUser(testApp, {
          permissions: [[PermissionAction.READ, PermissionSubject.ASSESSMENT]],
        }),
      )
    ).accessToken;
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  const partsOf = (sectionId: number) =>
    testApp.dataSource
      .getRepository(TestPart)
      .find({ where: { sectionId }, order: { order: 'ASC' } });

  const writingBody = async (
    sectionId: number,
    expectedRevision = 0,
    scores = [7, 6],
  ) => {
    const [part1, part2] = await partsOf(sectionId);
    return {
      expectedRevision,
      entries: [
        {
          partId: part1.id,
          criteria: {
            TA: scores[0],
            CC: scores[0],
            LR: scores[0],
            GRA: scores[0],
          },
        },
        {
          partId: part2.id,
          criteria: { TR: scores[1], CC: 7, LR: scores[1], GRA: 7 },
          feedback: 'Well argued',
        },
      ],
    };
  };

  const grade = (sectionId: string, body: object, token = grader) =>
    testApp
      .http()
      .post(`/api/grading/sections/${sectionId}/assessments`)
      .auth(token, { type: 'bearer' })
      .send(body);

  const studentCall = (method: 'get' | 'post' | 'put', path: string) =>
    testApp.http()[method](`/api/student/attempts${path}`).auth(student, {
      type: 'bearer',
    });

  const submittedWriting = async () => {
    const seeded = await seedExam(testApp, [SkillType.WRITING]);
    const sections = await testApp.dataSource
      .getRepository(TestSection)
      .find({ where: { testId: seeded.test.id }, order: { order: 'ASC' } });
    const ids = sections.map((s) => s.id);

    const attempt = await studentCall('post', '')
      .send({
        testId: seeded.test.id,
        mode: AttemptMode.SECTION,
        sectionIds: ids,
      })
      .expect(201);
    const id = attempt.body.id as string;

    for (const sectionId of ids) {
      const parts = await partsOf(sectionId);
      const rows = await testApp.dataSource
        .getRepository(Question)
        .createQueryBuilder('q')
        .innerJoin(QuestionGroup, 'g', 'g.id = q.groupId')
        .where('g.partId IN (:...partIds)', {
          partIds: parts.map((p) => p.id),
        })
        .getMany();
      await studentCall('put', `/${id}/answers`)
        .send({
          answers: rows.map((r) => ({
            questionId: r.id,
            response: { text: 'An essay' },
          })),
        })
        .expect(200);
    }
    await studentCall('post', `/${id}/submit`).expect(201);

    const attemptSections: Array<{ id: string; section_id: number }> =
      await testApp.dataSource.query(
        `SELECT attempt_section_id AS id, section_id FROM attempt_sections
          WHERE attempt_id = $1 ORDER BY section_id`,
        [id],
      );
    return { id, ids, attemptSections, testId: seeded.test.id };
  };

  const statusOf = async (id: string) =>
    (
      await testApp.dataSource.query(
        'SELECT status FROM attempts WHERE attempt_id = $1',
        [id],
      )
    )[0].status;

  it('grades a section and closes the attempt', async () => {
    const { id, ids, attemptSections } = await submittedWriting();

    const res = await grade(
      attemptSections[0].id,
      await writingBody(ids[0]),
    ).expect(201);

    expect(res.body).toMatchObject({ band: 6.5, revision: 1 });
    expect(res.body.grader.email).toBeDefined();
    const result = await studentCall('get', `/${id}/result`).expect(200);
    expect(result.body.attempt.status).toBe('GRADED');
    expect(result.body.attempt.sections[0]).toMatchObject({
      gradingStatus: 'GRADED',
      scaledScore: 6.5,
    });
    expect(result.body.assessments).toHaveLength(1);
  });

  it('keeps a SUBMITTED attempt open until the last section is graded', async () => {
    const { id, ids, attemptSections } = await submittedWriting();
    // A test holds one section per skill, so the second pending section is forced
    const [{ testId }] = await testApp.dataSource
      .getRepository(TestSection)
      .find({ where: { id: ids[0] } });
    const extra = await testApp.dataSource.getRepository(TestSection).save({
      testId,
      skill: SkillType.LISTENING,
      order: 5,
      durationMinutes: 30,
    });
    const [other] = await testApp.dataSource.query(
      `INSERT INTO attempt_sections (attempt_id, section_id, status, grading_status)
       VALUES ($1, $2, 'SUBMITTED', 'PENDING') RETURNING attempt_section_id AS id`,
      [id, extra.id],
    );

    await grade(attemptSections[0].id, await writingBody(ids[0])).expect(201);
    expect(await statusOf(id)).toBe('SUBMITTED');

    await testApp.dataSource.query(
      `UPDATE attempt_sections SET grading_status = 'GRADED' WHERE attempt_section_id = $1`,
      [other.id],
    );
    await grade(attemptSections[0].id, await writingBody(ids[0], 1)).expect(
      201,
    );
    expect(await statusOf(id)).toBe('GRADED');
  });

  it('corrects a grade as a new revision', async () => {
    const { id, ids, attemptSections } = await submittedWriting();
    const sectionId = attemptSections[0].id;
    const first = await grade(sectionId, await writingBody(ids[0])).expect(201);

    const second = await grade(
      sectionId,
      await writingBody(ids[0], 1, [5, 5]),
    ).expect(201);

    expect(second.body.revision).toBe(2);
    expect(second.body.band).toBe(5.5);
    const result = await studentCall('get', `/${id}/result`).expect(200);
    expect(result.body.attempt.sections[0].scaledScore).toBe(5.5);
    const rows = await testApp.dataSource.getRepository(Assessment).find({
      where: { attemptSectionId: sectionId },
      order: { revision: 'ASC' },
    });
    expect(rows.map((r) => [r.revision, r.band])).toEqual([
      [1, 6.5],
      [2, 5.5],
    ]);
    expect(rows[0].details.entries).toEqual(
      first.body.entries.map((e: object) => expect.objectContaining(e)),
    );
  });

  it('rejects a stale revision', async () => {
    const { ids, attemptSections } = await submittedWriting();
    const sectionId = attemptSections[0].id;
    await grade(sectionId, await writingBody(ids[0])).expect(201);

    const res = await grade(sectionId, await writingBody(ids[0], 0)).expect(
      409,
    );

    expect(res.body.code).toBe('ASSESSMENT_REVISION_CONFLICT');
    expect(
      await testApp.dataSource
        .getRepository(Assessment)
        .countBy({ attemptSectionId: sectionId }),
    ).toBe(1);
  });

  it('lets one of two concurrent grades through', async () => {
    const { ids, attemptSections } = await submittedWriting();
    const body = await writingBody(ids[0]);

    const results = await Promise.all([
      grade(attemptSections[0].id, body),
      grade(attemptSections[0].id, body),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('keeps an expired attempt EXPIRED', async () => {
    const { id, ids, attemptSections } = await submittedWriting();
    await testApp.dataSource.query(
      `UPDATE attempts SET status = 'EXPIRED' WHERE attempt_id = $1`,
      [id],
    );

    await grade(attemptSections[0].id, await writingBody(ids[0])).expect(201);

    expect(await statusOf(id)).toBe('EXPIRED');
    const [row] = await testApp.dataSource.query(
      'SELECT grading_status FROM attempt_sections WHERE attempt_section_id = $1',
      [attemptSections[0].id],
    );
    expect(row.grading_status).toBe('GRADED');
  });

  it('keeps an overdue attempt EXPIRED', async () => {
    const seeded = await seedExam(testApp, [SkillType.WRITING]);
    const sectionId = seeded.sections[SkillType.WRITING]!.id;
    const attempt = await studentCall('post', '')
      .send({
        testId: seeded.test.id,
        mode: AttemptMode.SECTION,
        sectionIds: [sectionId],
      })
      .expect(201);
    await studentCall('put', `/${attempt.body.id}/answers`)
      .send({
        answers: [
          {
            questionId: seeded.questions[SkillType.WRITING]![1].id,
            response: { text: 'essay' },
          },
        ],
      })
      .expect(200);
    await backdateOpenSections(testApp, attempt.body.id);
    await studentCall('get', `/${attempt.body.id}`).expect(200);
    const [row] = await testApp.dataSource.query(
      'SELECT attempt_section_id AS id FROM attempt_sections WHERE attempt_id = $1',
      [attempt.body.id],
    );

    await grade(row.id, await writingBody(sectionId)).expect(201);

    expect(await statusOf(attempt.body.id)).toBe('EXPIRED');
  });

  it('refuses sections that are not gradable', async () => {
    const blank = await seedExam(testApp, [SkillType.WRITING]);
    const blankAttempt = await studentCall('post', '')
      .send({
        testId: blank.test.id,
        mode: AttemptMode.SECTION,
        sectionIds: [blank.sections[SkillType.WRITING]!.id],
      })
      .expect(201);
    await studentCall('post', `/${blankAttempt.body.id}/submit`).expect(201);
    const [autoGraded] = await testApp.dataSource.query(
      'SELECT attempt_section_id AS id FROM attempt_sections WHERE attempt_id = $1',
      [blankAttempt.body.id],
    );
    const body = await writingBody(blank.sections[SkillType.WRITING]!.id);

    const auto = await grade(autoGraded.id, body).expect(409);
    expect(auto.body.code).toBe('SECTION_NOT_GRADABLE');

    const open = await seedExam(testApp, [SkillType.WRITING]);
    const openAttempt = await studentCall('post', '')
      .send({
        testId: open.test.id,
        mode: AttemptMode.SECTION,
        sectionIds: [open.sections[SkillType.WRITING]!.id],
      })
      .expect(201);
    const [inProgress] = await testApp.dataSource.query(
      'SELECT attempt_section_id AS id FROM attempt_sections WHERE attempt_id = $1',
      [openAttempt.body.id],
    );
    const pending = await grade(inProgress.id, body).expect(409);
    expect(pending.body.code).toBe('SECTION_NOT_GRADABLE');
  });

  it('rejects bad entries', async () => {
    const { ids, attemptSections } = await submittedWriting();
    const body = await writingBody(ids[0]);
    const [, part2] = await partsOf(ids[0]);

    const res = await grade(attemptSections[0].id, {
      ...body,
      entries: body.entries.slice(0, 1),
    }).expect(400);

    expect(res.body.message).toContain(`part ${part2.id}`);
  });

  it('requires CREATE ASSESSMENT', async () => {
    const { ids, attemptSections } = await submittedWriting();
    const body = await writingBody(ids[0]);

    await grade(attemptSections[0].id, body, reader).expect(403);
    await grade(attemptSections[0].id, body, student).expect(403);
  });

  it('rejects bad bodies', async () => {
    const { ids, attemptSections } = await submittedWriting();
    const body = await writingBody(ids[0]);
    const sectionId = attemptSections[0].id;

    const withFeedback = (length: number) => ({
      ...body,
      entries: [
        { ...body.entries[0], feedback: 'x'.repeat(length) },
        body.entries[1],
      ],
    });
    const tooLong = await grade(sectionId, withFeedback(5001)).expect(400);
    expect(JSON.stringify(tooLong.body.message)).toContain('feedback');
    await grade(sectionId, { ...body, expectedRevision: -1 }).expect(400);
    await grade('00000000-0000-4000-8000-000000000000', body).expect(404);
    await grade(sectionId, withFeedback(5000)).expect(201);
  });

  describe('queue and review', () => {
    const queue = (query = '', token = reader) =>
      testApp
        .http()
        .get(`/api/grading/queue?take=100${query}`)
        .auth(token, { type: 'bearer' });

    const idsIn = (body: { data: Array<{ attemptSectionId: string }> }) =>
      body.data.map((i) => i.attemptSectionId);

    const startWriting = async (
      essay: string | null,
      examOverrides: object = {},
    ) => {
      const seeded = await seedExam(
        testApp,
        [SkillType.WRITING],
        examOverrides,
      );
      const attempt = await studentCall('post', '')
        .send({
          testId: seeded.test.id,
          mode: AttemptMode.SECTION,
          sectionIds: [seeded.sections[SkillType.WRITING]!.id],
        })
        .expect(201);
      if (essay !== null) {
        await studentCall('put', `/${attempt.body.id}/answers`)
          .send({
            answers: [
              {
                questionId: seeded.questions[SkillType.WRITING]![1].id,
                response: { text: essay },
              },
            ],
          })
          .expect(200);
      }
      const [row] = await testApp.dataSource.query(
        'SELECT attempt_section_id AS id FROM attempt_sections WHERE attempt_id = $1',
        [attempt.body.id],
      );
      return {
        seeded,
        attemptId: attempt.body.id as string,
        sectionId: row.id,
      };
    };

    it('lists pending sections, oldest first', async () => {
      const a = await submittedWriting();
      const b = await submittedWriting();

      const res = await queue().expect(200);

      const ids = idsIn(res.body);
      expect(ids).toEqual(expect.arrayContaining([a.attemptSections[0].id]));
      expect(ids.indexOf(a.attemptSections[0].id)).toBeLessThan(
        ids.indexOf(b.attemptSections[0].id),
      );
      const times = res.body.data.map((i: { submittedAt: string }) =>
        Date.parse(i.submittedAt),
      );
      expect(times).toEqual([...times].sort((x, y) => x - y));
      const item = res.body.data.find(
        (i: { attemptSectionId: string }) =>
          i.attemptSectionId === a.attemptSections[0].id,
      );
      expect(item).toMatchObject({
        attemptId: a.id,
        gradingStatus: 'PENDING',
        band: null,
        grader: null,
        skill: 'WRITING',
        test: { id: a.testId, examType: 'IELTS_ACADEMIC' },
      });
      expect(item.student.id).toBeDefined();
    });

    it('filters by status, skill, test and search', async () => {
      const a = await submittedWriting();
      const b = await submittedWriting();
      await grade(a.attemptSections[0].id, await writingBody(a.ids[0])).expect(
        201,
      );

      const graded = await queue('&gradingStatus=GRADED').expect(200);
      const item = graded.body.data.find(
        (i: { attemptSectionId: string }) =>
          i.attemptSectionId === a.attemptSections[0].id,
      );
      expect(item).toMatchObject({ gradingStatus: 'GRADED', band: 6.5 });
      expect(item.grader.id).toBeDefined();
      expect(idsIn(graded.body)).not.toContain(b.attemptSections[0].id);

      const byTest = await queue(`&testId=${b.testId}`).expect(200);
      expect(idsIn(byTest.body)).toEqual([b.attemptSections[0].id]);

      const speaking = await queue(`&testId=${b.testId}&skill=SPEAKING`).expect(
        200,
      );
      expect(speaking.body.data).toEqual([]);
      const writing = await queue(`&testId=${b.testId}&skill=WRITING`).expect(
        200,
      );
      expect(idsIn(writing.body)).toEqual([b.attemptSections[0].id]);

      const email = item.student.email as string;
      const found = await queue(
        `&testId=${b.testId}&search=${encodeURIComponent(email.slice(1, 6))}`,
      ).expect(200);
      expect(idsIn(found.body)).toEqual([b.attemptSections[0].id]);
      const none = await queue(
        `&testId=${b.testId}&search=no-such-student-xyz`,
      ).expect(200);
      expect(none.body.data).toEqual([]);
    });

    it('rejects AUTO_GRADED as a queue filter', async () => {
      await queue('&gradingStatus=AUTO_GRADED').expect(400);
    });

    it('keeps blank sections and Listening out of the queue', async () => {
      const blank = await startWriting(null);
      await studentCall('post', `/${blank.attemptId}/submit`).expect(201);
      const listening = await seedExam(testApp, [SkillType.LISTENING]);
      const attempt = await studentCall('post', '')
        .send({
          testId: listening.test.id,
          mode: AttemptMode.SECTION,
          sectionIds: [listening.sections[SkillType.LISTENING]!.id],
        })
        .expect(201);
      await studentCall('post', `/${attempt.body.id}/submit`).expect(201);

      const all = await queue().expect(200);
      const done = await queue('&gradingStatus=GRADED').expect(200);

      const [row] = await testApp.dataSource.query(
        'SELECT attempt_section_id AS id FROM attempt_sections WHERE attempt_id = $1',
        [attempt.body.id],
      );
      for (const body of [all.body, done.body]) {
        expect(idsIn(body)).not.toContain(blank.sectionId);
        expect(idsIn(body)).not.toContain(row.id);
      }
    });

    it('still shows a timed-out attempt', async () => {
      const { attemptId, sectionId } = await startWriting('essay');
      await backdateOpenSections(testApp, attemptId);
      await studentCall('get', `/${attemptId}`).expect(200);
      expect(await statusOf(attemptId)).toBe('EXPIRED');

      const res = await queue().expect(200);

      expect(idsIn(res.body)).toContain(sectionId);
    });

    it('closes an abandoned attempt when the queue loads', async () => {
      const { attemptId, sectionId } = await startWriting('essay');
      await backdateOpenSections(testApp, attemptId);
      expect(await statusOf(attemptId)).toBe('IN_PROGRESS');

      const res = await queue().expect(200);

      expect(idsIn(res.body)).toContain(sectionId);
      expect(await statusOf(attemptId)).toBe('EXPIRED');
    });

    it('closes an abandoned blank attempt without listing it', async () => {
      const { attemptId, sectionId } = await startWriting(null);
      await backdateOpenSections(testApp, attemptId);

      const res = await queue().expect(200);

      expect(idsIn(res.body)).not.toContain(sectionId);
      expect(await statusOf(attemptId)).toBe('EXPIRED');
      const [row] = await testApp.dataSource.query(
        'SELECT grading_status FROM attempt_sections WHERE attempt_section_id = $1',
        [sectionId],
      );
      expect(row.grading_status).toBe('AUTO_GRADED');
    });

    it('leaves an attempt within its grace period open', async () => {
      const { attemptId } = await startWriting('essay');
      await testApp.dataSource.query(
        `UPDATE attempt_sections SET deadline_at = now() - interval '10 seconds'
          WHERE attempt_id = $1`,
        [attemptId],
      );
      await testApp.dataSource.query(
        `UPDATE attempts SET deadline_at = now() - interval '10 seconds'
          WHERE attempt_id = $1`,
        [attemptId],
      );

      await queue().expect(200);

      expect(await statusOf(attemptId)).toBe('IN_PROGRESS');
    });

    it('keeps graded work after the test is unpublished or deleted', async () => {
      const draft = await submittedWriting();
      const deleted = await submittedWriting();
      await testApp.dataSource.query(
        `UPDATE tests SET status = 'DRAFT' WHERE test_id = $1`,
        [draft.testId],
      );
      await testApp.dataSource.query(
        `UPDATE tests SET status = 'DELETED' WHERE test_id = $1`,
        [deleted.testId],
      );

      const res = await queue().expect(200);

      for (const item of [draft, deleted]) {
        const sectionId = item.attemptSections[0].id;
        expect(idsIn(res.body)).toContain(sectionId);
        await testApp
          .http()
          .get(`/api/grading/sections/${sectionId}`)
          .auth(reader, { type: 'bearer' })
          .expect(200);
        await grade(sectionId, await writingBody(item.ids[0])).expect(201);
      }
    });

    it('returns the grading screen', async () => {
      const seeded = await seedExam(testApp, [SkillType.WRITING]);
      const [task1, task2] = seeded.questions[SkillType.WRITING]!;
      const image = await testApp.dataSource.getRepository(Media).save({
        scope: MediaScope.TEST,
        ownerId: String(seeded.test.id),
        kind: MediaKind.IMAGE,
        storageKey: `tests/${seeded.test.id}/image/chart.png`,
      });
      await testApp.dataSource
        .getRepository(Question)
        .update(task1.id, { imageMediaId: image.id });
      const attempt = await studentCall('post', '')
        .send({
          testId: seeded.test.id,
          mode: AttemptMode.SECTION,
          sectionIds: [seeded.sections[SkillType.WRITING]!.id],
        })
        .expect(201);
      await studentCall('put', `/${attempt.body.id}/answers`)
        .send({
          answers: [
            {
              questionId: task2.id,
              response: { text: 'One two, three.\nFour' },
            },
          ],
        })
        .expect(200);
      await studentCall('post', `/${attempt.body.id}/submit`).expect(201);
      const [row] = await testApp.dataSource.query(
        'SELECT attempt_section_id AS id FROM attempt_sections WHERE attempt_id = $1',
        [attempt.body.id],
      );

      const res = await testApp
        .http()
        .get(`/api/grading/sections/${row.id}`)
        .auth(reader, { type: 'bearer' })
        .expect(200);

      expect(res.body).toMatchObject({
        attemptSectionId: row.id,
        attemptId: attempt.body.id,
        skill: 'WRITING',
        gradingStatus: 'PENDING',
        revision: 0,
        assessment: null,
        test: { id: seeded.test.id },
      });
      expect(
        res.body.expectedEntries.map((e: { task: number }) => e.task),
      ).toEqual([1, 2]);
      expect(res.body.expectedEntries[0].criteria).toContain('TA');
      expect(res.body.expectedEntries[1].criteria).toContain('TR');
      const questions = res.body.parts.flatMap(
        (p: { questions: object[] }) => p.questions,
      );
      expect(questions).toHaveLength(2);
      expect(questions[0]).toMatchObject({
        questionId: task1.id,
        sample: 'Sample',
        rubric: { TA: 'Band 7' },
        response: null,
        imageUrl: `http://storage.test/${image.storageKey}`,
      });
      expect(questions[1].response).toEqual({
        text: 'One two, three.\nFour',
        wordCount: 4,
        audioUrl: null,
      });
    });

    it('lists every revision, newest first, with the grader', async () => {
      const { ids, attemptSections } = await submittedWriting();
      const sectionId = attemptSections[0].id;
      await grade(sectionId, await writingBody(ids[0])).expect(201);
      await grade(sectionId, await writingBody(ids[0], 1, [5, 5])).expect(201);

      const res = await testApp
        .http()
        .get(`/api/grading/sections/${sectionId}/assessments`)
        .auth(reader, { type: 'bearer' })
        .expect(200);

      expect(res.body.map((a: { revision: number }) => a.revision)).toEqual([
        2, 1,
      ]);
      expect(res.body[0].band).toBe(5.5);
      expect(res.body[0].grader.id).toBeDefined();
      const screen = await testApp
        .http()
        .get(`/api/grading/sections/${sectionId}`)
        .auth(reader, { type: 'bearer' })
        .expect(200);
      expect(screen.body).toMatchObject({
        revision: 2,
        gradingStatus: 'GRADED',
        assessment: { revision: 2, band: 5.5 },
      });
      await testApp
        .http()
        .get(
          '/api/grading/sections/00000000-0000-4000-8000-000000000000/assessments',
        )
        .auth(reader, { type: 'bearer' })
        .expect(404);
    });

    it('requires READ ASSESSMENT', async () => {
      const { attemptSections } = await submittedWriting();
      const nobody = (
        await loginBo(testApp, await createUser(testApp, { permissions: [] }))
      ).accessToken;
      const id = attemptSections[0].id;

      for (const path of [
        '/queue',
        `/sections/${id}`,
        `/sections/${id}/assessments`,
      ]) {
        for (const token of [nobody, student]) {
          await testApp
            .http()
            .get(`/api/grading${path}`)
            .auth(token, { type: 'bearer' })
            .expect(403);
        }
      }
    });
  });
});
