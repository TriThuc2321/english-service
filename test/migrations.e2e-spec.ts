import { createTestApp, type TestApp } from './utils/app.js';
import { createUser } from './utils/fixtures.js';

describe('migrations', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('build the schema the entities describe', async () => {
    const { upQueries } = await testApp.dataSource.driver
      .createSchemaBuilder()
      .log();

    expect(upQueries.map(({ query }) => query)).toEqual([]);
  });

  it('backfills finished attempts and leaves open ones null', async () => {
    const { dataSource } = testApp;
    const user = await createUser(testApp);
    const runner = dataSource.createQueryRunner();
    while (await runner.hasColumn('attempt_sections', 'grading_status')) {
      await dataSource.undoLastMigration();
    }

    const [{ test_id: testId }] = await dataSource.query(
      `INSERT INTO tests (exam_type, title, slug)
       VALUES ('IELTS_ACADEMIC', 'T', 'migration-backfill') RETURNING test_id`,
    );
    const [{ section_id: sectionId }] = await dataSource.query(
      `INSERT INTO test_sections (test_id, skill, "order")
       VALUES ($1, 'LISTENING', 1) RETURNING section_id`,
      [testId],
    );
    const seed = async (status: string) => {
      const [{ attempt_id: attemptId }] = await dataSource.query(
        `INSERT INTO attempts (user_id, test_id, mode, status, started_at)
         VALUES ($1, $2, 'FULL', $3, now()) RETURNING attempt_id`,
        [user.id, testId, status],
      );
      const [{ attempt_section_id: id }] = await dataSource.query(
        `INSERT INTO attempt_sections (attempt_id, section_id)
         VALUES ($1, $2) RETURNING attempt_section_id`,
        [attemptId, sectionId],
      );
      return id as string;
    };
    const finishedSection = await seed('GRADED');
    const openSection = await seed('IN_PROGRESS');

    await dataSource.runMigrations();
    await runner.release();

    const statusOf = async (id: string) => {
      const [row] = await dataSource.query(
        `SELECT grading_status FROM attempt_sections WHERE attempt_section_id = $1`,
        [id],
      );
      return row.grading_status;
    };
    expect(await statusOf(finishedSection)).toBe('AUTO_GRADED');
    expect(await statusOf(openSection)).toBeNull();
  });

  it('revert cleanly', async () => {
    const { dataSource } = testApp;

    for (const _ of dataSource.migrations) await dataSource.undoLastMigration();
    const tables: { name: string }[] = await dataSource.query(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> 'migrations'`,
    );

    expect(tables).toEqual([]);
  });
});
