import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';

import { Paragraph } from '../../entities/paragraph.entity.js';
import { Passage } from '../../entities/passage.entity.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import { Status } from '../../types/common.type.js';
import {
  CreateParagraphDto,
  DeleteParagraphsDto,
  ListParagraphsDto,
  ReorderParagraphsDto,
  UpdateParagraphDto,
} from './dto/paragraphs.dto.js';

@Injectable()
export class ParagraphsService {
  constructor(
    @InjectRepository(Paragraph)
    private paragraphRepository: Repository<Paragraph>,
    @InjectRepository(Passage) private passageRepository: Repository<Passage>,
    private dataSource: DataSource,
  ) {}

  async findAll({ passageId, page, take }: ListParagraphsDto) {
    await this.assertPassageExists(passageId);

    const [data, totalCount] = await this.paragraphRepository.findAndCount({
      where: { passageId },
      order: { order: 'ASC', id: 'ASC' },
      skip: (page - 1) * take,
      take,
    });

    return new PaginationDto(data, new PageMetaDto({ page, take, totalCount }));
  }

  async findById(id: number) {
    const paragraph = await this.paragraphRepository.findOneBy({ id });
    if (!paragraph) {
      throw new NotFoundException(`Paragraph with ID ${id} not found`);
    }

    return paragraph;
  }

  async create(dto: CreateParagraphDto) {
    await this.assertPassageExists(dto.passageId);

    let { order } = dto;
    if (order === undefined) {
      const last = await this.paragraphRepository.maximum('order', {
        passageId: dto.passageId,
      });
      order = last === null ? 0 : last + 1;
    }

    const paragraph = await this.paragraphRepository.save({ ...dto, order });

    return this.findById(paragraph.id);
  }

  async update(id: number, dto: UpdateParagraphDto) {
    await this.findById(id);
    await this.paragraphRepository.update(id, dto);

    return this.findById(id);
  }

  async reorder({ passageId, ids }: ReorderParagraphsDto) {
    await this.assertPassageExists(passageId);

    const count = await this.paragraphRepository.countBy({
      id: In(ids),
      passageId,
    });
    if (count !== ids.length) {
      throw new BadRequestException(
        'One or more paragraphs do not belong to this passage',
      );
    }

    await this.dataSource.transaction((manager) =>
      Promise.all(
        ids.map((id, order) => manager.update(Paragraph, id, { order })),
      ),
    );

    return this.paragraphRepository.find({
      where: { passageId },
      order: { order: 'ASC', id: 'ASC' },
    });
  }

  async deleteByIds({ ids }: DeleteParagraphsDto) {
    const result = await this.paragraphRepository.delete({ id: In(ids) });

    return { deleted: result.affected ?? 0 };
  }

  private async assertPassageExists(passageId: number) {
    const exists = await this.passageRepository.exists({
      where: { id: passageId, status: Not(Status.DELETED) },
    });
    if (!exists) {
      throw new NotFoundException(`Passage with ID ${passageId} not found`);
    }
  }
}
