import { randomUUID } from 'node:crypto';

import { GroupPassage } from '../src/entities/group-passage.entity.js';
import { Media } from '../src/entities/media.entity.js';
import { Paragraph } from '../src/entities/paragraph.entity.js';
import { Passage } from '../src/entities/passage.entity.js';
import { QuestionGroup } from '../src/entities/question-group.entity.js';
import { Question } from '../src/entities/question.entity.js';
import { TestPart } from '../src/entities/test-part.entity.js';
import { TestSection } from '../src/entities/test-section.entity.js';
import { Test } from '../src/entities/test.entity.js';
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

describe('Student tests', () => {
  let testApp: TestApp;
  let webToken: string;
  let boToken: string;

  const createTest = (overrides: Partial<Test> = {}) =>
    testApp.dataSource.getRepository(Test).save({
      examType: ExamType.IELTS_ACADEMIC,
      title: 'Cambridge 18 - Test 1',
      slug: `cambridge-18-test-1-${randomUUID()}`,
      status: TestStatus.PUBLISHED,
      publishedAt: new Date(),
      ...overrides,
    });

  const createPassage = async (title: string, paragraphs: string[]) => {
    const passage = await testApp.dataSource
      .getRepository(Passage)
      .save({ title });
    await testApp.dataSource.getRepository(Paragraph).save(
      paragraphs.map((content, order) => ({
        content,
        order: paragraphs.length - order,
        passageId: passage.id,
      })),
    );
    return passage;
  };

  const getList = (query = '') =>
    testApp
      .http()
      .get(`/api/student/tests${query}`)
      .auth(webToken, { type: 'bearer' });

  beforeAll(async () => {
    testApp = await createTestApp();
    ({ accessToken: webToken } = await loginWeb(
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

  it('lists only published tests with their sections', async () => {
    const published = await createTest({ title: 'Listed Alpha' });
    await testApp.dataSource.getRepository(TestSection).save([
      { testId: published.id, skill: SkillType.READING, order: 1 },
      {
        testId: published.id,
        skill: SkillType.LISTENING,
        order: 0,
        durationMinutes: 30,
      },
    ]);
    await createTest({ title: 'Listed Draft', status: TestStatus.DRAFT });
    await createTest({ title: 'Listed Deleted', status: TestStatus.DELETED });

    const res = await getList('?search=Listed').expect(200);

    expect(res.body.meta.totalCount).toBe(1);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: published.id,
      slug: published.slug,
      title: 'Listed Alpha',
      testSections: [
        { skill: SkillType.LISTENING, order: 0, durationMinutes: 30 },
        { skill: SkillType.READING, order: 1, durationMinutes: null },
      ],
    });
    expect(res.body.data[0]).not.toHaveProperty('status');
    expect(res.body.data[0]).not.toHaveProperty('auditMetadata');
  });

  it('filters by exam type and paginates', async () => {
    for (let i = 0; i < 3; i++) {
      await createTest({ title: `Toeic ${i}`, examType: ExamType.TOEIC_LR });
    }

    const res = await getList(
      `?examType=${ExamType.TOEIC_LR}&take=2&page=2`,
    ).expect(200);

    expect(res.body.meta).toMatchObject({ page: 2, take: 2, totalCount: 3 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].examType).toBe(ExamType.TOEIC_LR);
  });

  it('paginates by test, not by test section', async () => {
    for (let i = 0; i < 2; i++) {
      const test = await createTest({ title: `Paged ${i}` });
      await testApp.dataSource.getRepository(TestSection).save([
        { testId: test.id, skill: SkillType.READING, order: 1 },
        { testId: test.id, skill: SkillType.LISTENING, order: 0 },
      ]);
    }

    const pages = await Promise.all(
      [1, 2].map((page) =>
        getList(`?search=Paged&take=1&page=${page}`).expect(200),
      ),
    );

    for (const res of pages) {
      expect(res.body.meta.totalCount).toBe(2);
      expect(res.body.data).toHaveLength(1);
      expect(
        res.body.data[0].testSections.map((s: TestSection) => s.skill),
      ).toEqual([SkillType.LISTENING, SkillType.READING]);
    }
    expect(pages[0].body.data[0].id).not.toBe(pages[1].body.data[0].id);
  });

  it('returns the full content of a test without answers', async () => {
    const test = await createTest();
    const [listening, reading] = await testApp.dataSource
      .getRepository(TestSection)
      .save([
        { testId: test.id, skill: SkillType.LISTENING, order: 0 },
        { testId: test.id, skill: SkillType.READING, order: 1 },
      ]);
    const audio = await testApp.dataSource.getRepository(Media).save({
      scope: MediaScope.TEST,
      ownerId: String(test.id),
      kind: MediaKind.AUDIO,
      storageKey: `tests/${test.id}/audio/part1.mp3`,
      mimeType: 'audio/mpeg',
      transcript: 'The answer is B',
    });
    const partPassage = await createPassage('The Lost City', [
      'First paragraph',
      'Second paragraph',
    ]);
    const groupPassage = await createPassage('Notice', ['Notice body']);

    const parts = testApp.dataSource.getRepository(TestPart);
    const listeningPart = await parts.save({
      sectionId: listening.id,
      order: 0,
      audioMediaId: audio.id,
    });
    const readingPart = await parts.save({
      sectionId: reading.id,
      order: 0,
      passageId: partPassage.id,
    });

    const groups = testApp.dataSource.getRepository(QuestionGroup);
    const listeningGroup = await groups.save({
      partId: listeningPart.id,
      order: 0,
      questionType: QuestionType.MULTIPLE_CHOICE,
    });
    const readingGroup = await groups.save({
      partId: readingPart.id,
      order: 0,
      questionType: QuestionType.TRUE_FALSE_NOT_GIVEN,
    });
    await testApp.dataSource
      .getRepository(GroupPassage)
      .save({ groupId: readingGroup.id, passageId: groupPassage.id });

    await testApp.dataSource.getRepository(Question).save([
      {
        groupId: listeningGroup.id,
        numberFrom: 1,
        numberTo: 1,
        order: 0,
        prompt: 'Where is the meeting?',
        content: { options: [{ key: 'A' }, { key: 'B' }] },
        answer: { key: 'B' },
        explanation: 'Said at 0:42',
      },
      {
        groupId: readingGroup.id,
        numberFrom: 2,
        numberTo: 2,
        order: 1,
        prompt: 'Second',
        answer: { key: 'TRUE' },
        evidence: { paragraph: 1 },
      },
      {
        groupId: readingGroup.id,
        numberFrom: 1,
        numberTo: 1,
        order: 0,
        prompt: 'First',
        answer: { key: 'FALSE' },
      },
    ]);

    const res = await testApp
      .http()
      .get(`/api/student/tests/${test.slug}`)
      .auth(webToken, { type: 'bearer' })
      .expect(200);

    const keys = collectKeys(res.body);
    for (const hidden of HIDDEN_KEYS) {
      expect(keys.has(hidden)).toBe(false);
    }

    expect(res.body).toMatchObject({
      id: test.id,
      testSections: [
        {
          skill: SkillType.LISTENING,
          testParts: [
            {
              id: listeningPart.id,
              passage: null,
              audio: {
                id: audio.id,
                kind: MediaKind.AUDIO,
                mimeType: 'audio/mpeg',
                url: `http://storage.test/${audio.storageKey}`,
              },
              questionGroups: [
                {
                  id: listeningGroup.id,
                  passages: [],
                  audio: null,
                  questions: [
                    {
                      prompt: 'Where is the meeting?',
                      content: { options: [{ key: 'A' }, { key: 'B' }] },
                      image: null,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          skill: SkillType.READING,
          testParts: [
            {
              audio: null,
              passage: {
                id: partPassage.id,
                title: 'The Lost City',
                paragraphs: [
                  { content: 'Second paragraph' },
                  { content: 'First paragraph' },
                ],
              },
              questionGroups: [
                {
                  passages: [
                    {
                      id: groupPassage.id,
                      paragraphs: [{ content: 'Notice body' }],
                    },
                  ],
                  questions: [{ prompt: 'First' }, { prompt: 'Second' }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns 404 for draft, deleted and unknown tests', async () => {
    const draft = await createTest({ status: TestStatus.DRAFT });
    const deleted = await createTest({ status: TestStatus.DELETED });

    for (const slug of [draft.slug, deleted.slug, 'unknown-test']) {
      await testApp
        .http()
        .get(`/api/student/tests/${slug}`)
        .auth(webToken, { type: 'bearer' })
        .expect(404);
    }
  });

  it('rejects backoffice tokens and anonymous requests', async () => {
    const test = await createTest();

    await testApp
      .http()
      .get('/api/student/tests')
      .auth(boToken, { type: 'bearer' })
      .expect(403);
    await testApp
      .http()
      .get(`/api/student/tests/${test.slug}`)
      .auth(boToken, { type: 'bearer' })
      .expect(403);
    await testApp.http().get('/api/student/tests').expect(401);
  });
});
