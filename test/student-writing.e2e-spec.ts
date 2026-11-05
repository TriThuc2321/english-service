import { Question } from '../src/entities/question.entity.js';
import { AttemptMode } from '../src/types/attempt.type.js';
import { ExamType, SkillType } from '../src/types/test.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginWeb } from './utils/fixtures.js';
import { seedExam } from './utils/grading.js';

describe('Student writing attempts', () => {
  let testApp: TestApp;
  let token: string;

  const start = (
    testId: number,
    mode = AttemptMode.FULL,
    sectionIds?: number[],
  ) =>
    testApp
      .http()
      .post('/api/student/attempts')
      .auth(token, { type: 'bearer' })
      .send({ testId, mode, sectionIds });

  beforeAll(async () => {
    testApp = await createTestApp();
    ({ accessToken: token } = await loginWeb(
      testApp,
      await createUser(testApp),
    ));
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('saves a 20,000 character essay through autosave', async () => {
    const { test, sections, questions } = await seedExam(testApp, [
      SkillType.WRITING,
    ]);
    const attempt = await start(test.id, AttemptMode.SECTION, [
      sections[SkillType.WRITING]!.id,
    ]).expect(201);
    const text = 'a'.repeat(20_000);

    await testApp
      .http()
      .put(`/api/student/attempts/${attempt.body.id}/answers`)
      .auth(token, { type: 'bearer' })
      .send({
        answers: [
          {
            questionId: questions[SkillType.WRITING]![1].id,
            response: { text },
          },
        ],
      })
      .expect(200);

    const res = await testApp
      .http()
      .get(`/api/student/attempts/${attempt.body.id}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(res.body.answers).toEqual([
      expect.objectContaining({
        questionId: questions[SkillType.WRITING]![1].id,
        response: { text },
      }),
    ]);
  });

  it('keeps FULL on Listening and Reading', async () => {
    const { test } = await seedExam(testApp, [
      SkillType.LISTENING,
      SkillType.READING,
      SkillType.WRITING,
    ]);

    const res = await start(test.id).expect(201);

    expect(res.body.sections.map((s: { skill: SkillType }) => s.skill)).toEqual(
      [SkillType.LISTENING, SkillType.READING],
    );
  });

  it('refuses to start a TOEIC_SW test', async () => {
    const { test, sections } = await seedExam(
      testApp,
      [SkillType.SPEAKING, SkillType.WRITING],
      { examType: ExamType.TOEIC_SW },
    );

    await start(test.id).expect(400);
    await start(test.id, AttemptMode.SECTION, [
      sections[SkillType.WRITING]!.id,
    ]).expect(400);
  });

  it('refuses a Writing section with only Task 2', async () => {
    const { test, sections, questions } = await seedExam(testApp, [
      SkillType.LISTENING,
      SkillType.WRITING,
    ]);
    await testApp.dataSource
      .getRepository(Question)
      .delete(questions[SkillType.WRITING]![0].id);

    await start(test.id, AttemptMode.SECTION, [
      sections[SkillType.WRITING]!.id,
    ]).expect(400);
  });

  it('keeps Speaking closed', async () => {
    const { test, sections } = await seedExam(testApp, [
      SkillType.LISTENING,
      SkillType.SPEAKING,
    ]);

    await start(test.id, AttemptMode.SECTION, [
      sections[SkillType.SPEAKING]!.id,
    ]).expect(400);
  });
});
