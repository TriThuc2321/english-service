import type { TestProject } from 'vitest/node';

import { PostgreSqlContainer } from '@testcontainers/postgresql';

export interface ITestDatabase {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    db: ITestDatabase;
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();

  project.provide('db', {
    host: container.getHost(),
    port: container.getPort(),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
  });

  return async () => {
    await container.stop();
  };
}
