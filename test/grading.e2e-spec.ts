import { Assessment } from '../src/entities/assessment.entity.js';
import { QuestionGroup } from '../src/entities/question-group.entity.js';
import { Question } from '../src/entities/question.entity.js';
import { TestPart } from '../src/entities/test-part.entity.js';
import { TestSection } from '../src/entities/test-section.entity.js';
import { AttemptMode } from '../src/types/attempt.type.js';
import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
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
    return { id, ids, attemptSections };
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

    await grade(sectionId, {
      ...body,
      entries: [{ ...body.entries[0], feedback: 'x'.repeat(5001) }],
    }).expect(400);
    await grade(sectionId, { ...body, expectedRevision: -1 }).expect(400);
    await grade('00000000-0000-4000-8000-000000000000', body).expect(404);
  });
});
