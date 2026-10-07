import { Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export interface HttpsConfig {
  key: Buffer;
  cert: Buffer;
}

const resolveCertPath = (path: string) =>
  isAbsolute(path) ? path : resolve(process.cwd(), path);

export const getHttpsOptions = (): HttpsConfig | undefined => {
  const keyPath = process.env.HTTPS_KEY_PATH;
  const certPath = process.env.HTTPS_CERT_PATH;

  if (!keyPath || !certPath) return undefined;

  try {
    return {
      key: readFileSync(resolveCertPath(keyPath)),
      cert: readFileSync(resolveCertPath(certPath)),
    };
  } catch (error) {
    Logger.error(
      `Failed to read HTTPS certificates (key: ${keyPath}, cert: ${certPath}), falling back to HTTP`,
      error instanceof Error ? error.stack : String(error),
      'HttpsConfig',
    );
    return undefined;
  }
};

export const getLocalDomain = () =>
  process.env.HTTPS_LOCAL_DOMAIN ?? 'localhost';
