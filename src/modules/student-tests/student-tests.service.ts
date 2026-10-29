import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';

import { Media } from '../../entities/media.entity.js';
import { Passage } from '../../entities/passage.entity.js';
import { Question } from '../../entities/question.entity.js';
import { TestPart } from '../../entities/test-part.entity.js';
import { Test } from '../../entities/test.entity.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import { TestStatus } from '../../types/test.type.js';
import { StudentMediaDto } from './dto/student-test-response.dto.js';
import { ListStudentTestsDto } from './dto/student-tests.dto.js';

const LIST_COLUMNS = [
  't.id',
  't.examType',
  't.title',
  't.slug',
  't.source',
  't.durationMinutes',
  't.publishedAt',
  's.id',
  's.skill',
  's.order',
  's.durationMinutes',
];

// Question answer/explanation/evidence are select: false and must stay out
const DETAIL_COLUMNS = [
  ...LIST_COLUMNS,
  'p.id',
  'p.order',
  'p.title',
  'p.instruction',
  'p.audioMediaId',
  'p.audioStartMs',
  'p.audioEndMs',
  'p.passageId',
  'g.id',
  'g.order',
  'g.questionType',
  'g.instruction',
  'g.wordLimit',
  'g.content',
  'g.audioMediaId',
  'g.imageMediaId',
  'gp.groupId',
  'gp.passageId',
  'gp.order',
  'q.id',
  'q.numberFrom',
  'q.numberTo',
  'q.order',
  'q.prompt',
  'q.content',
  'q.audioMediaId',
  'q.imageMediaId',
  'q.audioStartMs',
];

interface ILookup {
  passages: Map<number, Passage>;
  media: Map<number, StudentMediaDto>;
}

const pick = <T>(map: Map<number, T>, id?: number | null) =>
  (id != null && map.get(id)) || null;

const withMedia = <T extends Pick<Question, 'audioMediaId' | 'imageMediaId'>>(
  { audioMediaId, imageMediaId, ...rest }: T,
  { media }: ILookup,
) => ({
  ...rest,
  audio: pick(media, audioMediaId),
  image: pick(media, imageMediaId),
});

@Injectable()
export class StudentTestsService {
  constructor(
    @InjectRepository(Test) private testRepository: Repository<Test>,
    @InjectRepository(Passage) private passageRepository: Repository<Passage>,
    @InjectRepository(Media) private mediaRepository: Repository<Media>,
    private storage: StorageService,
  ) {}

  private publishedQuery(columns: string[]) {
    return this.testRepository
      .createQueryBuilder('t')
      .leftJoin('t.testSections', 's')
      .select(columns)
      .where('t.status = :published', { published: TestStatus.PUBLISHED });
  }

  private withContent(qb: SelectQueryBuilder<Test>) {
    return qb
      .leftJoin('s.testParts', 'p')
      .leftJoin('p.questionGroups', 'g')
      .leftJoin('g.groupPassages', 'gp')
      .leftJoin('g.questions', 'q')
      .orderBy('s.order', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .addOrderBy('p.order', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .addOrderBy('g.order', 'ASC')
      .addOrderBy('g.id', 'ASC')
      .addOrderBy('gp.order', 'ASC')
      .addOrderBy('q.order', 'ASC')
      .addOrderBy('q.id', 'ASC');
  }

  async findAll({ page, take, search, examType }: ListStudentTestsDto) {
    const qb = this.publishedQuery(LIST_COLUMNS);

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
      .orderBy('t.publishedAt', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .skip((page - 1) * take)
      .take(take)
      .getManyAndCount();

    // Ordering by a joined column would make TypeORM page over section rows
    for (const test of data) {
      test.testSections.sort((a, b) => a.order - b.order || a.id - b.id);
    }

    return new PaginationDto(data, new PageMetaDto({ page, take, totalCount }));
  }

  async findBySlug(slug: string) {
    const test = await this.withContent(
      this.publishedQuery(DETAIL_COLUMNS).andWhere('t.slug = :slug', { slug }),
    ).getOne();
    if (!test) {
      throw new NotFoundException(`Test "${slug}" not found`);
    }

    return this.toDetail(test);
  }

  async findContent(testId: number, sectionIds: number[]) {
    if (!sectionIds.length) return null;

    const test = await this.withContent(
      this.testRepository
        .createQueryBuilder('t')
        .innerJoin('t.testSections', 's', 's.id IN (:...sectionIds)', {
          sectionIds,
        })
        .select(DETAIL_COLUMNS)
        .where('t.id = :testId', { testId }),
    ).getOne();

    return test ? this.toDetail(test) : null;
  }

  private async toDetail(test: Test) {
    const parts = test.testSections.flatMap((s) => s.testParts);
    const groups = parts.flatMap((p) => p.questionGroups);
    const questions = groups.flatMap((g) => g.questions);

    const [passages, media] = await Promise.all([
      this.findPassages([
        ...parts.map((p) => p.passageId),
        ...groups.flatMap((g) => g.groupPassages.map((gp) => gp.passageId)),
      ]),
      this.findMedia([
        ...parts.map((p) => p.audioMediaId),
        ...[...groups, ...questions].flatMap((m) => [
          m.audioMediaId,
          m.imageMediaId,
        ]),
      ]),
    ]);
    const lookup: ILookup = { passages, media };

    const { testSections, ...rest } = test;
    return {
      ...rest,
      testSections: testSections.map(({ testParts, ...section }) => ({
        ...section,
        testParts: testParts.map((part) => this.toPart(part, lookup)),
      })),
    };
  }

  private toPart(
    { questionGroups, audioMediaId, passageId, ...part }: TestPart,
    lookup: ILookup,
  ) {
    return {
      ...part,
      audio: pick(lookup.media, audioMediaId),
      passage: pick(lookup.passages, passageId),
      questionGroups: questionGroups.map(
        ({ groupPassages, questions, ...group }) => ({
          ...withMedia(group, lookup),
          passages: groupPassages
            .map((gp) => pick(lookup.passages, gp.passageId))
            .filter((passage) => passage !== null),
          questions: questions.map((q) => withMedia(q, lookup)),
        }),
      ),
    };
  }

  private async findPassages(ids: Array<number | null | undefined>) {
    const unique = [...new Set(ids.filter((id) => id != null))];
    if (!unique.length) return new Map<number, Passage>();

    const passages = await this.passageRepository.find({
      select: {
        id: true,
        title: true,
        subtitle: true,
        markedBy: true,
        paragraphs: { id: true, content: true, order: true },
      },
      relations: { paragraphs: true },
      where: { id: In(unique) },
      order: { paragraphs: { order: 'ASC', id: 'ASC' } },
    });

    return new Map(passages.map((p) => [p.id, p]));
  }

  private async findMedia(ids: Array<number | null | undefined>) {
    const unique = [...new Set(ids.filter((id) => id != null))];
    if (!unique.length) return new Map<number, StudentMediaDto>();

    const media = await this.mediaRepository.find({
      select: {
        id: true,
        kind: true,
        mimeType: true,
        durationMs: true,
        storageKey: true,
      },
      where: { id: In(unique) },
    });

    return new Map(
      media.map((m): [number, StudentMediaDto] => [
        m.id,
        {
          id: m.id,
          kind: m.kind,
          mimeType: m.mimeType ?? null,
          durationMs: m.durationMs ?? null,
          url: this.storage.getPublicUrl(m.storageKey),
        },
      ]),
    );
  }
}
