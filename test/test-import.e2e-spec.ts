import type { ITestImport } from '../src/modules/test-import/test-import.type.js';

import { MarkedBy, Passage } from '../src/entities/passage.entity.js';
import { Question } from '../src/entities/question.entity.js';
import { TestPart } from '../src/entities/test-part.entity.js';
import { Test } from '../src/entities/test.entity.js';
import { PermissionAction, PermissionSubject } from '../src/types/auth.type.js';
import {
  ExamType,
  QuestionType,
  SkillType,
  TestStatus,
} from '../src/types/test.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, loginBo } from './utils/fixtures.js';

const document = (): ITestImport => ({
  examType: ExamType.IELTS_ACADEMIC,
  title: 'Imported Reading Test',
  source: 'Sưu tầm 1',
  durationMinutes: 60,
  sections: [
    {
      skill: SkillType.READING,
      durationMinutes: 60,
      parts: [
        {
          title: 'Reading Passage 1',
          passage: {
            title: 'Stadiums',
            markedBy: MarkedBy.ALPHABET,
            paragraphs: [
              'Today, however, stadiums are regarded with growing scepticism.',
              'It became a fortress with four towers.',
            ],
          },
          groups: [
            {
              questionType: QuestionType.SUMMARY_COMPLETION,
              wordLimit: 1,
              content: { template: 'It was converted into a {{1}}.' },
              questions: [
                {
                  numberFrom: 1,
                  answer: { accepted: ['fortress'] },
                  evidence: { paragraph: 2, quote: 'a fortress' },
                },
              ],
            },
            {
              questionType: QuestionType.MULTIPLE_CHOICE_MULTI,
              questions: [
                {
                  numberFrom: 2,
                  numberTo: 3,
                  prompt: 'Which TWO?',
                  content: {
                    options: ['A', 'B', 'C'].map((key) => ({ key, text: key })),
                  },
                  answer: { keys: ['A', 'C'] },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe('Test import', () => {
  let testApp: TestApp;
  let accessToken: string;

  const importTest = (body: unknown, token = accessToken) =>
    testApp
      .http()
      .post('/api/tests/import')
      .auth(token, { type: 'bearer' })
      .send(body as object);

  const counts = async () => ({
    tests: await testApp.dataSource.getRepository(Test).count(),
    passages: await testApp.dataSource.getRepository(Passage).count(),
  });

  beforeAll(async () => {
    testApp = await createTestApp();
    const user = await createUser(testApp, {
      permissions: [
        [PermissionAction.CREATE, PermissionSubject.TEST],
        [PermissionAction.CREATE, PermissionSubject.PASSAGE],
      ],
    });
    ({ accessToken } = await loginBo(testApp, user));
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('creates the whole test as a draft in one call', async () => {
    const res = await importTest(document()).expect(201);

    expect(res.body.warnings).toEqual([]);
    expect(res.body.test).toMatchObject({
      title: 'Imported Reading Test',
      slug: 'imported-reading-test',
      status: TestStatus.DRAFT,
      testSections: [{ skill: SkillType.READING, order: 0 }],
    });

    const [part] = await testApp.dataSource.getRepository(TestPart).find({
      where: { testSection: { testId: res.body.test.id } },
      relations: { passage: { paragraphs: true }, questionGroups: true },
    });
    expect(part.passage).toMatchObject({
      title: 'Stadiums',
      markedBy: MarkedBy.ALPHABET,
    });
    const paragraphs = part.passage!.paragraphs.sort(
      (a, b) => a.order - b.order,
    );
    expect(paragraphs.map((p) => p.content)).toEqual(
      document().sections[0].parts[0].passage!.paragraphs,
    );
    expect(
      part.questionGroups.map((g) => [g.order, g.questionType]).sort(),
    ).toEqual([
      [0, QuestionType.SUMMARY_COMPLETION],
      [1, QuestionType.MULTIPLE_CHOICE_MULTI],
    ]);

    const questions = await testApp.dataSource
      .getRepository(Question)
      .createQueryBuilder('q')
      .addSelect(['q.answer', 'q.evidence'])
      .where('q.groupId IN (:...ids)', {
        ids: part.questionGroups.map((g) => g.id),
      })
      .orderBy('q.numberFrom')
      .getMany();
    expect(questions).toMatchObject([
      {
        numberFrom: 1,
        numberTo: 1,
        answer: { accepted: ['fortress'] },
        evidence: { paragraphId: paragraphs[1].id, quote: 'a fortress' },
      },
      { numberFrom: 2, numberTo: 3, answer: { keys: ['A', 'C'] } },
    ]);
  });

  it('returns warnings without blocking the import', async () => {
    const doc = document();
    doc.sections[0].parts[0].groups[0].questions[0].answer = {
      accepted: ['castle'],
    };

    const res = await importTest(doc).expect(201);

    expect(res.body.test.slug).toBe('imported-reading-test-2');
    expect(res.body.warnings).toEqual([
      {
        severity: 'warning',
        path: 'sections[0].parts[0].groups[0].questions[0]',
        message: 'answer "castle" to 1 is not in the passage',
      },
    ]);
  });

  it('rejects a document with errors and persists nothing', async () => {
    const before = await counts();
    const doc = document();
    doc.sections[0].parts[0].groups[1].questions[0].numberFrom = 3;
    doc.sections[0].parts[0].groups[1].questions[0].numberTo = 4;

    const res = await importTest(doc).expect(400);

    expect(res.body.message).toEqual([
      'sections[0].parts[0].groups[1].questions[0]: expected question 2, got 3 (numbering restarts at 1 in every section)',
    ]);
    expect(await counts()).toEqual(before);
  });

  it('validates the document shape before the content rules', async () => {
    const doc = document();
    doc.sections[0].parts[0].groups = [];

    const res = await importTest(doc).expect(400);

    expect(res.body.message).toEqual([
      'sections.0.parts.0.groups should not be empty',
    ]);
  });

  it('rejects a taken slug before writing anything', async () => {
    const before = await counts();

    await importTest({ ...document(), slug: 'imported-reading-test' }).expect(
      409,
    );
    expect(await counts()).toEqual(before);
  });

  it('requires permission to create passages', async () => {
    const user = await createUser(testApp, {
      permissions: [[PermissionAction.CREATE, PermissionSubject.TEST]],
    });
    const { accessToken: token } = await loginBo(testApp, user);

    await importTest(document(), token).expect(403);
  });
});
