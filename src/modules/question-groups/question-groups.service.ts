import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';

import { GroupPassage } from '../../entities/group-passage.entity.js';
import { Passage, PassageStatus } from '../../entities/passage.entity.js';
import { QuestionGroup } from '../../entities/question-group.entity.js';
import { Question } from '../../entities/question.entity.js';
import { MediaValidator } from '../../shared/media/media.validator.js';
import { TestStatus } from '../../types/test.type.js';
import {
  assertAnswerInOptions,
  assertValidAnswer,
} from '../questions/question-answer.js';
import {
  assertValidEvidence,
  assertValidGroupContent,
  assertValidQuestionContent,
} from '../questions/question-content.js';
import { TestPartsService } from '../test-parts/test-parts.service.js';
import { TestsService } from '../tests/tests.service.js';
import {
  CreateQuestionGroupDto,
  DeleteQuestionGroupsDto,
  ListQuestionGroupsDto,
  ReorderQuestionGroupsDto,
  UpdateQuestionGroupDto,
} from './dto/question-groups.dto.js';

@Injectable()
export class QuestionGroupsService {
  constructor(
    @InjectRepository(QuestionGroup)
    private groupRepository: Repository<QuestionGroup>,
    @InjectRepository(Question)
    private questionRepository: Repository<Question>,
    @InjectRepository(Passage) private passageRepository: Repository<Passage>,
    private testsService: TestsService,
    private testPartsService: TestPartsService,
    private mediaValidator: MediaValidator,
    private dataSource: DataSource,
  ) {}

  async findAll({ partId }: ListQuestionGroupsDto) {
    await this.testPartsService.findPartTest(partId);

    return this.withPassages()
      .where('g.partId = :partId', { partId })
      .orderBy('g.order', 'ASC')
      .addOrderBy('g.id', 'ASC')
      .addOrderBy('gp.order', 'ASC')
      .getMany();
  }

  async findById(id: number) {
    const group = await this.withPassages()
      .leftJoinAndSelect('g.questions', 'q')
      .addSelect(['q.answer', 'q.explanation', 'q.evidence'])
      .where('g.id = :id', { id })
      .orderBy('gp.order', 'ASC')
      .addOrderBy('q.order', 'ASC')
      .addOrderBy('q.id', 'ASC')
      .getOne();
    if (!group) {
      throw new NotFoundException(`Question group with ID ${id} not found`);
    }

    return group;
  }

  async create(dto: CreateQuestionGroupDto) {
    const { passageIds = [], questions = [], ...rest } = dto;
    const test = await this.testPartsService.findPartTest(dto.partId);
    this.testsService.assertEditable(test);

    const normalized = questions.map((q, index) => ({
      ...q,
      numberTo: q.numberTo ?? q.numberFrom,
      order: q.order ?? index,
    }));
    assertValidGroupContent(dto.questionType, rest.content);
    for (const q of normalized) {
      assertValidAnswer(dto.questionType, q);
      assertValidQuestionContent(dto.questionType, q.content, q.numberFrom);
      assertValidEvidence(q.evidence, q.numberFrom);
      assertAnswerInOptions(dto.questionType, q, rest.content);
    }

    await this.mediaValidator.assertKinds(rest);
    for (const q of normalized) {
      await this.mediaValidator.assertKinds(q);
    }
    await this.assertPassagesExist(passageIds);

    let { order } = rest;
    if (order === undefined) {
      const last = await this.groupRepository.maximum('order', {
        partId: dto.partId,
      });
      order = last === null ? 0 : last + 1;
    }

    const group = await this.groupRepository.save({
      ...rest,
      order,
      questions: normalized,
      groupPassages: passageIds.map((passageId, i) => ({
        passageId,
        order: i,
      })),
    });

    return this.findById(group.id);
  }

  async update(id: number, dto: UpdateQuestionGroupDto) {
    const { passageIds, ...rest } = dto;
    const { group, test } = await this.findGroupContext(id);
    this.testsService.assertEditable(test);

    const typeChanged =
      rest.questionType !== undefined &&
      rest.questionType !== group.questionType;
    const questionType = rest.questionType ?? group.questionType;

    const contentChanged = rest.content !== undefined;
    const groupContent = contentChanged ? rest.content : group.content;

    if (typeChanged || contentChanged) {
      assertValidGroupContent(questionType, groupContent);

      // Existing answers must still fit the new type and options
      const questions = await this.questionRepository.find({
        select: {
          id: true,
          numberFrom: true,
          numberTo: true,
          content: true,
          answer: true,
        },
        where: { groupId: id },
      });
      for (const q of questions) {
        if (typeChanged) {
          assertValidAnswer(questionType, q);
          assertValidQuestionContent(questionType, q.content, q.numberFrom);
        }
        assertAnswerInOptions(questionType, q, groupContent);
      }
    }

    await this.mediaValidator.assertKinds(rest);
    if (passageIds) {
      await this.assertPassagesExist(passageIds);
    }

    await this.dataSource.transaction(async (manager) => {
      if (Object.keys(rest).length) {
        await manager.save(QuestionGroup, { id, ...rest });
      }
      if (passageIds) {
        await manager.delete(GroupPassage, { groupId: id });
        if (passageIds.length) {
          await manager.insert(
            GroupPassage,
            passageIds.map((passageId, order) => ({
              groupId: id,
              passageId,
              order,
            })),
          );
        }
      }
    });

    return this.findById(id);
  }

  async reorder({ partId, ids }: ReorderQuestionGroupsDto) {
    const test = await this.testPartsService.findPartTest(partId);
    this.testsService.assertEditable(test);

    const [matched, total] = await Promise.all([
      this.groupRepository.countBy({ id: In(ids), partId }),
      this.groupRepository.countBy({ partId }),
    ]);
    if (matched !== ids.length) {
      throw new BadRequestException(
        'One or more question groups do not belong to this part',
      );
    }
    if (total !== ids.length) {
      throw new BadRequestException(
        `ids must include all ${total} question groups of this part`,
      );
    }

    await this.dataSource.transaction((manager) =>
      Promise.all(
        ids.map((id, order) => manager.update(QuestionGroup, id, { order })),
      ),
    );

    return this.findAll({ partId });
  }

  async deleteByIds({ ids }: DeleteQuestionGroupsDto) {
    const groups = await this.withTest()
      .where('g.id IN (:...ids)', { ids })
      .getMany();

    for (const group of groups) {
      this.testsService.assertEditable(group.testPart.testSection.test);
    }

    if (!groups.length) {
      return { deleted: 0 };
    }

    const result = await this.groupRepository.delete({
      id: In(groups.map((g) => g.id)),
    });

    return { deleted: result.affected ?? 0 };
  }

  async findGroupContext(groupId: number) {
    const group = await this.withTest()
      .where('g.id = :groupId', { groupId })
      .andWhere('t.status != :deleted', { deleted: TestStatus.DELETED })
      .getOne();
    if (!group) {
      throw new NotFoundException(
        `Question group with ID ${groupId} not found`,
      );
    }

    return { group, test: group.testPart.testSection.test };
  }

  private withTest() {
    return this.groupRepository
      .createQueryBuilder('g')
      .innerJoin('g.testPart', 'p')
      .innerJoin('p.testSection', 's')
      .innerJoin('s.test', 't')
      .addSelect(['p.id', 's.id', 't.id', 't.lockedAt']);
  }

  private withPassages() {
    return this.groupRepository
      .createQueryBuilder('g')
      .leftJoin('g.groupPassages', 'gp')
      .leftJoin('gp.passage', 'passage')
      .addSelect([
        'gp.groupId',
        'gp.passageId',
        'gp.order',
        'passage.id',
        'passage.title',
        'passage.subtitle',
      ]);
  }

  private async assertPassagesExist(ids: number[]) {
    if (!ids.length) return;

    const count = await this.passageRepository.countBy({
      id: In(ids),
      status: Not(PassageStatus.DELETED),
    });
    if (count !== ids.length) {
      throw new BadRequestException('One or more passages not found');
    }
  }
}
