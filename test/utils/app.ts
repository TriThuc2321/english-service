import type { NestExpressApplication } from '@nestjs/platform-express';

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { DataSource, getMetadataArgsStorage } from 'typeorm';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { getDbOption } from '../../src/configs/database.config.js';
import { StorageService } from '../../src/shared/storage/storage.service.js';

// Not exported by @nestjs/typeorm; the provider forRootAsync registers its options under
const TYPEORM_MODULE_OPTIONS = 'TypeOrmModuleOptions';

// TypeORM's entity glob uses Node's native import(), which can't load .ts
// sources and would create class copies separate from the ones Vite hands to
// the services, so the entities are imported through Vite instead.
const entitiesDir = fileURLToPath(
  new URL('../../src/entities', import.meta.url),
);
for (const file of readdirSync(entitiesDir)) {
  if (file.endsWith('.entity.ts')) await import(join(entitiesDir, file));
}
const entities = getMetadataArgsStorage().tables.map(({ target }) => target);

const createFakeStorage = () => ({
  uploadUrlTtl: 600,
  cacheControl: 'public, max-age=31536000, immutable',
  getUploadUrl: vi.fn(async (key: string) => `http://storage.test/${key}`),
  getPublicUrl: vi.fn((key: string) => `http://storage.test/${key}`),
  head: vi.fn(async () => null),
  delete: vi.fn(async () => {}),
});

export async function createTestApp() {
  const storage = createFakeStorage();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TYPEORM_MODULE_OPTIONS)
    .useFactory({
      factory: (config: ConfigService) => ({
        ...getDbOption(config),
        entities,
      }),
      inject: [ConfigService],
    })
    .overrideProvider(StorageService)
    .useValue(storage)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  await app.init();

  return {
    app,
    storage,
    dataSource: app.get(DataSource),
    http: () => request(app.getHttpServer()),
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
