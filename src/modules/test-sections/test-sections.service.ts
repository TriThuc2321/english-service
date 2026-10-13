import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import type { Test } from '../../entities/test.entity.js';
import type { SkillType } from '../../types/test.type.js';

import { TestSection } from '../../entities/test-section.entity.js';
import { TestsService } from '../tests/tests.service.js';
import {
  CreateTestSectionDto,
  DeleteTestSectionsDto,
  ListTestSectionsDto,
  ReorderTestSectionsDto,
  UpdateTestSectionDto,
} from './dto/test-sections.dto.js';

@Injectable()
export class TestSectionsService {
  constructor(
    @InjectRepository(TestSection)
    private sectionRepository: Repository<TestSection>,
    private testsService: TestsService,
    private dataSource: DataSource,
  ) {}

  async findAll({ testId }: ListTestSectionsDto) {
    await this.testsService.findExistingTest(testId);

    return this.findByTestId(testId);
  }

  async findById(id: number) {
    const section = await this.sectionRepository.findOneBy({ id });
    if (!section) {
      throw new NotFoundException(`Test section with ID ${id} not found`);
    }

    return section;
  }

  async create(dto: CreateTestSectionDto) {
    const test = await this.testsService.findEditableTest(dto.testId);
    await this.assertSkillAvailable(test, dto.skill);

    let { order } = dto;
    if (order === undefined) {
      const last = await this.sectionRepository.maximum('order', {
        testId: dto.testId,
      });
      order = last === null ? 0 : last + 1;
    }

    const section = await this.sectionRepository.save({ ...dto, order });

    return this.findById(section.id);
  }

  async update(id: number, dto: UpdateTestSectionDto) {
    const section = await this.findById(id);
    const test = await this.testsService.findEditableTest(section.testId);

    if (dto.skill && dto.skill !== section.skill) {
      await this.assertSkillAvailable(test, dto.skill);
    }

    await this.sectionRepository.update(id, dto);

    return this.findById(id);
  }

  async reorder({ testId, ids }: ReorderTestSectionsDto) {
    await this.testsService.findEditableTest(testId);

    const [matched, total] = await Promise.all([
      this.sectionRepository.countBy({ id: In(ids), testId }),
      this.sectionRepository.countBy({ testId }),
    ]);
    if (matched !== ids.length) {
      throw new BadRequestException(
        'One or more sections do not belong to this test',
      );
    }

    if (total !== ids.length) {
      throw new BadRequestException(
        `ids must include all ${total} sections of this test`,
      );
    }

    await this.dataSource.transaction((manager) =>
      Promise.all(
        ids.map((id, order) => manager.update(TestSection, id, { order })),
      ),
    );

    return this.findByTestId(testId);
  }

  async deleteByIds({ ids }: DeleteTestSectionsDto) {
    const sections = await this.sectionRepository.find({
      select: { id: true, testId: true },
      where: { id: In(ids) },
    });

    const testIds = [...new Set(sections.map((s) => s.testId))];
    for (const testId of testIds) {
      await this.testsService.findEditableTest(testId);
    }

    if (!sections.length) {
      return { deleted: 0 };
    }

    const result = await this.sectionRepository.delete({
      id: In(sections.map((s) => s.id)),
    });

    return { deleted: result.affected ?? 0 };
  }

  private findByTestId(testId: number) {
    return this.sectionRepository.find({
      where: { testId },
      order: { order: 'ASC', id: 'ASC' },
    });
  }

  private async assertSkillAvailable(test: Test, skill: SkillType) {
    this.testsService.assertSkillsAllowed(test.examType, [skill]);

    const taken = await this.sectionRepository.existsBy({
      testId: test.id,
      skill,
    });
    if (taken) {
      throw new ConflictException(
        `Test with ID ${test.id} already has a ${skill} section`,
      );
    }
  }
}
