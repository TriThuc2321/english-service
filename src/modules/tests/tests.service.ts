import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Not, Repository } from 'typeorm';

import { TestSection } from '../../entities/test-section.entity.js';
import { Test } from '../../entities/test.entity.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import {
  EXAM_SKILLS,
  ExamType,
  SkillType,
  TestStatus,
} from '../../types/test.type.js';
import {
  CreateTestDto,
  DeleteTestsDto,
  ListTestsDto,
  TestSectionInputDto,
  UpdateTestDto,
} from './dto/tests.dto.js';

const LIST_COLUMNS = [
  't.id',
  't.examType',
  't.title',
  't.source',
  't.durationMinutes',
  't.status',
  't.publishedAt',
  't.lockedAt',
  't.auditMetadata.createdAt',
  't.auditMetadata.createdById',
  't.auditMetadata.updatedAt',
  't.auditMetadata.updatedById',
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
  's.id',
  's.testId',
  's.skill',
  's.order',
  's.durationMinutes',
];

@Injectable()
export class TestsService {
  constructor(
    @InjectRepository(Test) private testRepository: Repository<Test>,
    @InjectRepository(TestSection)
    private sectionRepository: Repository<TestSection>,
  ) {}

  private baseQuery(columns: string[]) {
    return this.testRepository
      .createQueryBuilder('t')
      .leftJoin('t.auditMetadata.createdBy', 'creator')
      .leftJoin('t.auditMetadata.updatedBy', 'updater')
      .select(columns)
      .where('t.status != :deleted', { deleted: TestStatus.DELETED });
  }

  async findAll({ page, take, search, status, examType }: ListTestsDto) {
    const qb = this.baseQuery(LIST_COLUMNS);

    if (status) {
      qb.andWhere('t.status = :status', { status });
    }
    if (examType) {
      qb.andWhere('t.examType = :examType', { examType });
    }
    if (search) {
      qb.andWhere(
        new Brackets((w) =>
          w.where('t.title ILIKE :search').orWhere('t.source ILIKE :search'),
        ),
        { search: `%${search}%` },
      );
    }

    const [data, totalCount] = await qb
      .orderBy('t.auditMetadata.createdAt', 'DESC')
      .skip((page - 1) * take)
      .take(take)
      .getManyAndCount();

    return new PaginationDto(data, new PageMetaDto({ page, take, totalCount }));
  }

  async findById(id: number) {
    const test = await this.baseQuery(DETAIL_COLUMNS)
      .leftJoin('t.testSections', 's')
      .andWhere('t.id = :id', { id })
      .orderBy('s.order', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .getOne();

    if (!test) {
      throw new NotFoundException(`Test with ID ${id} not found`);
    }

    return test;
  }

  async create(dto: CreateTestDto, actorId: string) {
    const { sections, ...rest } = dto;
    const normalized = this.normalizeSections(sections);
    this.assertSkillsAllowed(
      dto.examType,
      normalized.map((s) => s.skill),
    );

    const test = await this.testRepository.save({
      ...rest,
      testSections: normalized,
      auditMetadata: { createdById: actorId },
    });

    return this.findById(test.id);
  }

  async update(id: number, dto: UpdateTestDto, actorId: string) {
    const test = await this.findExistingTest(id);

    if (dto.examType && dto.examType !== test.examType) {
      if (test.lockedAt) {
        throw new BadRequestException(
          'Cannot change the exam type of a locked test',
        );
      }
      const sections = await this.sectionRepository.find({
        select: { skill: true },
        where: { testId: id },
      });
      this.assertSkillsAllowed(
        dto.examType,
        sections.map((s) => s.skill),
      );
    }

    const publishedAt =
      dto.status === TestStatus.PUBLISHED && !test.publishedAt
        ? new Date()
        : undefined;

    await this.testRepository.update(id, {
      ...dto,
      ...(publishedAt && { publishedAt }),
      auditMetadata: { updatedAt: new Date(), updatedById: actorId },
    });

    return this.findById(id);
  }

  async deleteByIds({ ids }: DeleteTestsDto, actorId: string) {
    const result = await this.testRepository.update(
      { id: In(ids), status: Not(TestStatus.DELETED) },
      {
        status: TestStatus.DELETED,
        auditMetadata: { updatedAt: new Date(), updatedById: actorId },
      },
    );

    return { deleted: result.affected ?? 0 };
  }

  async findExistingTest(id: number) {
    const test = await this.testRepository.findOne({
      where: { id, status: Not(TestStatus.DELETED) },
    });
    if (!test) {
      throw new NotFoundException(`Test with ID ${id} not found`);
    }

    return test;
  }

  async findEditableTest(id: number) {
    const test = await this.findExistingTest(id);
    this.assertEditable(test);

    return test;
  }

  assertEditable(test: Pick<Test, 'id' | 'lockedAt'>) {
    if (test.lockedAt) {
      throw new BadRequestException(
        `Test with ID ${test.id} is locked; its structure can no longer change`,
      );
    }
  }

  assertSkillsAllowed(examType: ExamType, skills: SkillType[]) {
    const allowed = EXAM_SKILLS[examType];
    const invalid = skills.filter((skill) => !allowed.includes(skill));
    if (invalid.length) {
      throw new BadRequestException(
        `${examType} does not support skill(s): ${invalid.join(', ')}`,
      );
    }
    if (new Set(skills).size !== skills.length) {
      throw new BadRequestException('Each skill can appear only once per test');
    }
  }

  private normalizeSections(sections: TestSectionInputDto[] = []) {
    return sections.map((s, index) => ({
      skill: s.skill,
      order: s.order ?? index,
      durationMinutes: s.durationMinutes,
    }));
  }
}
