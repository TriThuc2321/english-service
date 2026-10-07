import { ConfigService, ConfigType, registerAs } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSourceOptions } from 'typeorm';

type PostgresConnectionOptions = Extract<
  DataSourceOptions,
  { type: 'postgres' }
>;

const __dirname = dirname(fileURLToPath(import.meta.url));

export type DatabaseConfig = ConfigType<typeof databaseConfig>;

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '', 10) || 5432,
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  name: process.env.DATABASE_NAME,
  sync: process.env.DATABASE_SYNC === 'true',
  ssl: process.env.DATABASE_SSL === 'true',
  sslCa: process.env.DATABASE_SSL_CA,
}));

const getSslOption = (
  ssl: boolean,
  sslCa?: string,
): PostgresConnectionOptions['ssl'] => {
  if (!ssl) return false;

  if (sslCa) {
    const ca = existsSync(sslCa) ? readFileSync(sslCa, 'utf8') : sslCa;
    return { rejectUnauthorized: true, ca };
  }

  return { rejectUnauthorized: true };
};

export const getDbOption = (
  configService: ConfigService,
): DataSourceOptions => {
  const { host, port, username, password, name, sync, ssl, sslCa } =
    configService.get<DatabaseConfig>('database') ?? {};

  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database: name,
    synchronize: sync,
    entities: [join(__dirname, './../entities/*.entity.{js,ts}')],
    ssl: getSslOption(ssl ?? false, sslCa),
  };
};
