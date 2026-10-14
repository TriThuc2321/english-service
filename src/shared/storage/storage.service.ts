import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';

import {
  type StorageConfig,
  storageConfig,
} from '../../configs/storage.config.js';

// Keys are never overwritten (each upload gets a fresh uuid), so clients may cache forever
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface IStoredObject {
  size: number;
  contentType?: string;
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;

  constructor(
    @Inject(storageConfig.KEY) private readonly config: StorageConfig,
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Newer SDKs sign a CRC32 checksum into presigned PUTs by default, which
      // browser uploads can't satisfy
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  get uploadUrlTtl() {
    return this.config.uploadUrlTtl;
  }

  get cacheControl() {
    return IMMUTABLE_CACHE_CONTROL;
  }

  // The presigner only signs `host` by default; forcing these headers into the
  // signature makes R2 reject an upload whose Content-Type differs from the one requested
  getUploadUrl(key: string, contentType: string) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
      {
        expiresIn: this.config.uploadUrlTtl,
        signableHeaders: new Set(['content-type', 'cache-control']),
      },
    );
  }

  // Bucket is served publicly through a custom domain (Cloudflare CDN in front);
  // keys are unguessable uuids, access control happens at the API level
  getPublicUrl(key: string) {
    return `${this.config.publicUrl}/${key}`;
  }

  async head(key: string): Promise<IStoredObject | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      if (
        err instanceof S3ServiceException &&
        err.$metadata.httpStatusCode === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
  }
}
