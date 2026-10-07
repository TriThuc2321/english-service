import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Not, Repository } from 'typeorm';

import { Paragraph } from '../../entities/paragraph.entity.js';
import { Passage } from '../../entities/passage.entity.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import { Status } from '../../types/common.type.js';
import {
  CreatePassageDto,
  DeletePassagesDto,
  ListPassagesDto,
  ParagraphInputDto,
  UpdatePassageDto,
} from './dto/passages.dto.js';

const LIST_COLUMNS = [
  'p.id',
  'p.title',
  'p.subtitle',
  'p.markedBy',
  'p.status',
  'p.auditMetadata.createdAt',
  'p.auditMetadata.createdById',
  'p.auditMetadata.updatedAt',
  'p.auditMetadata.updatedById',
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

const DETAIL_COLUMNS = [
  ...LIST_COLUMNS,
  'para.id',
  'para.content',
  'para.order',
  'para.passageId',
];

@Injectable()
export class PassagesService {
  constructor(
    @InjectRepository(Passage) private passageRepository: Repository<Passage>,
    private dataSource: DataSource,
  ) {}

  private baseQuery(columns: string[]) {
    return this.passageRepository
      .createQueryBuilder('p')
      .leftJoin('p.auditMetadata.createdBy', 'creator')
      .leftJoin('p.auditMetadata.updatedBy', 'updater')
      .select(columns)
      .where('p.status != :deleted', { deleted: Status.DELETED });
  }

  async findAll({ page, take, search, status, markedBy }: ListPassagesDto) {
    const qb = this.baseQuery(LIST_COLUMNS);

    if (status) {
      qb.andWhere('p.status = :status', { status });
    }
    if (markedBy) {
      qb.andWhere('p.markedBy = :markedBy', { markedBy });
    }
    if (search) {
      qb.andWhere(
        new Brackets((w) =>
          w.where('p.title ILIKE :search').orWhere('p.subtitle ILIKE :search'),
        ),
        { search: `%${search}%` },
      );
    }

    const [data, totalCount] = await qb
      .orderBy('p.auditMetadata.createdAt', 'DESC')
      .skip((page - 1) * take)
      .take(take)
      .getManyAndCount();

    return new PaginationDto(data, new PageMetaDto({ page, take, totalCount }));
  }

  async findById(id: number) {
    const passage = await this.baseQuery(DETAIL_COLUMNS)
      .leftJoin('p.paragraphs', 'para')
      .andWhere('p.id = :id', { id })
      .orderBy('para.order', 'ASC')
      .addOrderBy('para.id', 'ASC')
      .getOne();

    if (!passage) {
      throw new NotFoundException(`Passage with ID ${id} not found`);
    }

    return passage;
  }

  async create(dto: CreatePassageDto, actorId: string) {
    const { paragraphs, ...rest } = dto;

    const passage = await this.passageRepository.save({
      ...rest,
      paragraphs: this.normalizeParagraphs(paragraphs),
      auditMetadata: { createdById: actorId },
    });

    return this.findById(passage.id);
  }

  async update(id: number, dto: UpdatePassageDto, actorId: string) {
    const passage = await this.passageRepository.findOne({
      where: { id, status: Not(Status.DELETED) },
    });
    if (!passage) {
      throw new NotFoundException(`Passage with ID ${id} not found`);
    }

    const { paragraphs, ...rest } = dto;

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Passage, id, {
        ...rest,
        auditMetadata: { updatedAt: new Date(), updatedById: actorId },
      });

      if (paragraphs !== undefined) {
        await manager.delete(Paragraph, { passageId: id });
        const rows = this.normalizeParagraphs(paragraphs).map((p) => ({
          ...p,
          passageId: id,
        }));
        if (rows.length) {
          await manager.insert(Paragraph, rows);
        }
      }
    });

    return this.findById(id);
  }

  async deleteByIds({ ids }: DeletePassagesDto, actorId: string) {
    const result = await this.passageRepository.update(
      { id: In(ids), status: Not(Status.DELETED) },
      {
        status: Status.DELETED,
        auditMetadata: { updatedAt: new Date(), updatedById: actorId },
      },
    );

    return { deleted: result.affected ?? 0 };
  }

  private normalizeParagraphs(paragraphs: ParagraphInputDto[] = []) {
    return paragraphs.map((p, index) => ({
      content: p.content,
      order: p.order ?? index,
    }));
  }
}
