import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type FindOptionsSelect, In, Repository } from 'typeorm';

import { TestPart } from '../../entities/test-part.entity.js';
import { TestSection } from '../../entities/test-section.entity.js';
import { Test } from '../../entities/test.entity.js';
import { MediaScope } from '../../types/media.type.js';
import { TestStatus } from '../../types/test.type.js';
import { MediaValidator } from '../media/media.validator.js';
import { PassagesService } from '../passages/passages.service.js';
import { TestsService } from '../tests/tests.service.js';
import {
  CreateTestPartDto,
  DeleteTestPartsDto,
  ListTestPartsDto,
  ReorderTestPartsDto,
  UpdateTestPartDto,
} from './dto/test-parts.dto.js';

const PART_SELECT: FindOptionsSelect<TestPart> = {
  id: true,
  sectionId: true,
  order: true,
  title: true,
  instruction: true,
  audioMediaId: true,
  audioStartMs: true,
  audioEndMs: true,
  passageId: true,
  passage: { id: true, title: true, subtitle: true },
};

@Injectable()
export class TestPartsService {
  constructor(
    @InjectRepository(TestPart) private partRepository: Repository<TestPart>,
    @InjectRepository(Test) private testRepository: Repository<Test>,
    private testsService: TestsService,
    private mediaValidator: MediaValidator,
    private passagesService: PassagesService,
    private dataSource: DataSource,
  ) {}

  async findAll({ sectionId }: ListTestPartsDto) {
    await this.findSectionTest(sectionId);

    return this.findBySectionId(sectionId);
  }

  async findById(id: number) {
    const part = await this.partRepository.findOne({
      where: { id },
      relations: { passage: true },
      select: PART_SELECT,
    });
    if (!part) {
      throw new NotFoundException(`Test part with ID ${id} not found`);
    }

    return part;
  }

  async create(dto: CreateTestPartDto) {
    const test = await this.findSectionTest(dto.sectionId);
    this.testsService.assertEditable(test);
    this.assertAudioRange(dto);
    await this.mediaValidator.assertRefs(dto, MediaScope.TEST);
    if (dto.passageId != null) {
      await this.passagesService.assertExist([dto.passageId]);
    }

    let { order } = dto;
    if (order === undefined) {
      const last = await this.partRepository.maximum('order', {
        sectionId: dto.sectionId,
      });
      order = last === null ? 0 : last + 1;
    }

    const part = await this.partRepository.save({ ...dto, order });

    return this.findById(part.id);
  }

  async update(id: number, dto: UpdateTestPartDto) {
    const part = await this.findById(id);
    const test = await this.findSectionTest(part.sectionId);
    this.testsService.assertEditable(test);
    this.assertAudioRange({ ...part, ...dto });
    await this.mediaValidator.assertRefs(dto, MediaScope.TEST);
    if (dto.passageId != null) {
      await this.passagesService.assertExist([dto.passageId]);
    }

    await this.partRepository.update(id, dto);

    return this.findById(id);
  }

  async reorder({ sectionId, ids }: ReorderTestPartsDto) {
    const test = await this.findSectionTest(sectionId);
    this.testsService.assertEditable(test);

    const [matched, total] = await Promise.all([
      this.partRepository.countBy({ id: In(ids), sectionId }),
      this.partRepository.countBy({ sectionId }),
    ]);
    if (matched !== ids.length) {
      throw new BadRequestException(
        'One or more parts do not belong to this section',
      );
    }
    if (total !== ids.length) {
      throw new BadRequestException(
        `ids must include all ${total} parts of this section`,
      );
    }

    await this.dataSource.transaction((manager) =>
      Promise.all(
        ids.map((id, order) => manager.update(TestPart, id, { order })),
      ),
    );

    return this.findBySectionId(sectionId);
  }

  async deleteByIds({ ids }: DeleteTestPartsDto) {
    const parts = await this.partRepository
      .createQueryBuilder('p')
      .innerJoin('p.testSection', 's')
      .innerJoin('s.test', 't')
      .select(['p.id'])
      .addSelect(['s.id', 't.id', 't.lockedAt'])
      .where('p.id IN (:...ids)', { ids })
      .getMany();

    for (const part of parts) {
      this.testsService.assertEditable(part.testSection.test);
    }

    if (!parts.length) {
      return { deleted: 0 };
    }

    const result = await this.partRepository.delete({
      id: In(parts.map((p) => p.id)),
    });

    return { deleted: result.affected ?? 0 };
  }

  async findPartTest(partId: number) {
    const test = await this.testRepository
      .createQueryBuilder('t')
      .innerJoin(TestSection, 's', 's.testId = t.id')
      .innerJoin(TestPart, 'p', 'p.sectionId = s.id')
      .where('p.id = :partId', { partId })
      .andWhere('t.status != :deleted', { deleted: TestStatus.DELETED })
      .getOne();
    if (!test) {
      throw new NotFoundException(`Test part with ID ${partId} not found`);
    }

    return test;
  }

  private async findSectionTest(sectionId: number) {
    const test = await this.testRepository
      .createQueryBuilder('t')
      .innerJoin(TestSection, 's', 's.testId = t.id')
      .where('s.id = :sectionId', { sectionId })
      .andWhere('t.status != :deleted', { deleted: TestStatus.DELETED })
      .getOne();
    if (!test) {
      throw new NotFoundException(
        `Test section with ID ${sectionId} not found`,
      );
    }

    return test;
  }

  private findBySectionId(sectionId: number) {
    return this.partRepository.find({
      where: { sectionId },
      relations: { passage: true },
      select: PART_SELECT,
      order: { order: 'ASC', id: 'ASC' },
    });
  }

  private assertAudioRange({
    audioStartMs,
    audioEndMs,
  }: Pick<TestPart, 'audioStartMs' | 'audioEndMs'>) {
    if (
      audioStartMs != null &&
      audioEndMs != null &&
      audioEndMs <= audioStartMs
    ) {
      throw new BadRequestException('audioEndMs must be after audioStartMs');
    }
  }
}
