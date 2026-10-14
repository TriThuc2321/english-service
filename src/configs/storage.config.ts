import { ConfigType, registerAs } from '@nestjs/config';

export const storageConfig = registerAs('storage', () => ({
  endpoint: process.env.STORAGE_ENDPOINT as string,
  bucket: process.env.STORAGE_BUCKET as string,
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID as string,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY as string,
  uploadUrlTtl: Number(process.env.STORAGE_UPLOAD_URL_TTL ?? 600),
  // Trailing slash stripped so keys can be appended with a single '/'
  publicUrl: (process.env.STORAGE_PUBLIC_URL as string).replace(/\/+$/, ''),
}));

export type StorageConfig = ConfigType<typeof storageConfig>;
