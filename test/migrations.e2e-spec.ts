import { createTestApp, type TestApp } from './utils/app.js';

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
