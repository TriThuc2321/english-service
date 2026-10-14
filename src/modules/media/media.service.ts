import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';

import { Media } from '../../entities/media.entity.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import {
  CreateMediaDto,
  CreateUploadUrlDto,
  ListMediaDto,
  UpdateMediaDto,
} from './dto/media.dto.js';
import { MEDIA_MAX_BYTES, MEDIA_MIME_EXTENSIONS } from './media.constant.js';

const PG_FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(Media) private mediaRepository: Repository<Media>,
    private storage: StorageService,
  ) {}

  async createUploadUrl({ kind, contentType }: CreateUploadUrlDto) {
    const ext = MEDIA_MIME_EXTENSIONS[kind][contentType];
    if (!ext) {
      throw new BadRequestException(
        `Content type ${contentType} is not allowed for ${kind}`,
      );
    }

    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const storageKey = `${kind.toLowerCase()}/${now.getUTCFullYear()}/${month}/${randomUUID()}.${ext}`;

    return {
      storageKey,
      uploadUrl: await this.storage.getUploadUrl(storageKey, contentType),
      headers: {
        'Content-Type': contentType,
        'Cache-Control': this.storage.cacheControl,
      },
      expiresIn: this.storage.uploadUrlTtl,
    };
  }

  async findAll({ page, take, kind }: ListMediaDto) {
    const [data, totalCount] = await this.mediaRepository.findAndCount({
      where: kind ? { kind } : {},
      order: { id: 'DESC' },
      skip: (page - 1) * take,
      take,
    });

    return new PaginationDto(
      data.map((media) => this.withUrl(media)),
      new PageMetaDto({ page, take, totalCount }),
    );
  }

  async findById(id: number) {
    const media = await this.mediaRepository.findOneBy({ id });
    if (!media) {
      throw new NotFoundException(`Media with ID ${id} not found`);
    }

    return this.withUrl(media);
  }

  private withUrl(media: Media) {
    return { ...media, url: this.storage.getPublicUrl(media.storageKey) };
  }

  async create(dto: CreateMediaDto, actorId: string) {
    const { kind, storageKey, ...rest } = dto;

    if (!storageKey.startsWith(`${kind.toLowerCase()}/`)) {
      throw new BadRequestException(`Storage key does not belong to ${kind}`);
    }

    const object = await this.storage.head(storageKey);
    if (!object) {
      throw new BadRequestException('File has not been uploaded');
    }

    // A presigned PUT can't cap the body size, so oversized uploads are rejected here
    const contentType = object.contentType ?? '';
    if (
      object.size > MEDIA_MAX_BYTES[kind] ||
      !MEDIA_MIME_EXTENSIONS[kind][contentType]
    ) {
      await this.storage.delete(storageKey);
      throw new BadRequestException(
        `File must be ${Object.keys(MEDIA_MIME_EXTENSIONS[kind]).join(', ')} and at most ${MEDIA_MAX_BYTES[kind] / 1024 / 1024}MB`,
      );
    }

    const media = await this.mediaRepository.save({
      ...rest,
      kind,
      storageKey,
      mimeType: contentType,
      sizeBytes: String(object.size),
      auditMetadata: { createdById: actorId },
    });

    return this.findById(media.id);
  }

  async update(id: number, dto: UpdateMediaDto, actorId: string) {
    const result = await this.mediaRepository.update(id, {
      ...dto,
      auditMetadata: { updatedAt: new Date(), updatedById: actorId },
    });
    if (!result.affected) {
      throw new NotFoundException(`Media with ID ${id} not found`);
    }

    return this.findById(id);
  }

  // Hard delete: media has no status column, and a soft-deleted row would
  // keep a billable object in the bucket
  async delete(id: number) {
    const media = await this.mediaRepository.findOneBy({ id });
    if (!media) {
      throw new NotFoundException(`Media with ID ${id} not found`);
    }

    try {
      await this.mediaRepository.delete(id);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === PG_FOREIGN_KEY_VIOLATION
      ) {
        throw new ConflictException(`Media with ID ${id} is in use`);
      }
      throw err;
    }

    // The row is already gone; a failed object delete only leaves an orphan file
    await this.storage.delete(media.storageKey).catch((err: unknown) => {
      this.logger.warn(
        `Failed to delete object ${media.storageKey}: ${String(err)}`,
      );
    });

    return { deleted: 1 };
  }
}
