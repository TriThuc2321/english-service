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
import { MediaPolicyRegistry } from './media-policy.registry.js';
import { MEDIA_MIME_EXTENSIONS, MB, mediaKeyPrefix } from './media.constant.js';

const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_RESTRICT_VIOLATION = '23001';
const PG_UNIQUE_VIOLATION = '23505';

const COLUMNS = [
  'm',
  'creator.id',
  'creator.email',
  'creator.firstName',
  'creator.lastName',
  'creator.avatar',
  'updater.id',
  'updater.email',
  'updater.firstName',
  'updater.lastName',
  'updater.avatar',
];

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(Media) private mediaRepository: Repository<Media>,
    private storage: StorageService,
    private policies: MediaPolicyRegistry,
  ) {}

  async createUploadUrl({
    scope,
    ownerId,
    kind,
    contentType,
  }: CreateUploadUrlDto) {
    const { policy } = this.policies.getForKind(scope, kind);
    const ext = MEDIA_MIME_EXTENSIONS[kind][contentType];
    if (!ext) {
      throw new BadRequestException(
        `Content type ${contentType} is not allowed for ${kind}`,
      );
    }

    await policy.assertOwnerWritable(ownerId);

    const storageKey = `${mediaKeyPrefix(policy.prefix, ownerId, kind)}${randomUUID()}.${ext}`;

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

  private baseQuery() {
    return this.mediaRepository
      .createQueryBuilder('m')
      .leftJoin('m.auditMetadata.createdBy', 'creator')
      .leftJoin('m.auditMetadata.updatedBy', 'updater')
      .select(COLUMNS);
  }

  async findAll({ page, take, scope, ownerId, kind }: ListMediaDto) {
    const qb = this.baseQuery();

    if (scope) {
      qb.andWhere('m.scope = :scope', { scope });
    }
    if (ownerId) {
      qb.andWhere('m.ownerId = :ownerId', { ownerId });
    }
    if (kind) {
      qb.andWhere('m.kind = :kind', { kind });
    }

    const [data, totalCount] = await qb
      .orderBy('m.id', 'DESC')
      .skip((page - 1) * take)
      .take(take)
      .getManyAndCount();

    return new PaginationDto(
      data.map((media) => this.withUrl(media)),
      new PageMetaDto({ page, take, totalCount }),
    );
  }

  async findById(id: number) {
    const media = await this.baseQuery().where('m.id = :id', { id }).getOne();
    if (!media) {
      throw new NotFoundException(`Media with ID ${id} not found`);
    }

    return this.withUrl(media);
  }

  async findOwned(
    id: number,
    {
      scope,
      ownerId,
      kind,
    }: Pick<Media, 'scope'> &
      Partial<Pick<Media, 'kind'>> & { ownerId?: string },
  ) {
    const media = await this.mediaRepository.findOneBy({
      id,
      scope,
      ownerId,
      kind,
    });
    if (!media) {
      const of = ownerId ? ` of ${ownerId}` : '';
      throw new BadRequestException(
        `Media with ID ${id} is not ${[scope, kind].filter(Boolean).join(' ')} media${of}`,
      );
    }

    return this.withUrl(media);
  }

  private withUrl(media: Media) {
    return { ...media, url: this.storage.getPublicUrl(media.storageKey) };
  }

  async create(dto: CreateMediaDto, actorId: string) {
    const { scope, ownerId, kind, storageKey, ...rest } = dto;

    const { policy, maxBytes } = this.policies.getForKind(scope, kind);
    if (!storageKey.startsWith(mediaKeyPrefix(policy.prefix, ownerId, kind))) {
      throw new BadRequestException(
        `Storage key does not belong to ${kind} of ${[scope, ownerId].filter(Boolean).join(' ')}`,
      );
    }

    await policy.assertOwnerWritable(ownerId);

    // Must run before the validation below, which deletes the object on failure
    if (await this.mediaRepository.existsBy({ storageKey })) {
      throw new ConflictException('Storage key is already registered');
    }

    const object = await this.storage.head(storageKey);
    if (!object) {
      throw new BadRequestException('File has not been uploaded');
    }

    // A presigned PUT can't cap the body size, so oversized uploads are rejected here
    const contentType = object.contentType ?? '';
    if (object.size > maxBytes || !MEDIA_MIME_EXTENSIONS[kind][contentType]) {
      await this.storage.delete(storageKey);
      throw new BadRequestException(
        `File must be ${Object.keys(MEDIA_MIME_EXTENSIONS[kind]).join(', ')} and at most ${maxBytes / MB}MB`,
      );
    }

    let media: Media;
    try {
      media = await this.mediaRepository.save({
        ...rest,
        scope,
        ownerId: ownerId ?? null,
        kind,
        storageKey,
        mimeType: contentType,
        sizeBytes: String(object.size),
        auditMetadata: { createdById: actorId },
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Storage key is already registered');
      }
      throw err;
    }

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
        [PG_FOREIGN_KEY_VIOLATION, PG_RESTRICT_VIOLATION].includes(
          (err.driverError as { code?: string }).code ?? '',
        )
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

  async deleteQuietly(id: number) {
    await this.delete(id).catch((err: unknown) => {
      this.logger.warn(`Failed to delete media ${id}: ${String(err)}`);
    });
  }
}
