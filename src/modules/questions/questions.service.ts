import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Question } from '../../entities/question.entity.js';
import { MediaValidator } from '../../shared/media/media.validator.js';
import { QuestionGroupsService } from '../question-groups/question-groups.service.js';
import { TestsService } from '../tests/tests.service.js';
import {
  CreateQuestionDto,
  DeleteQuestionsDto,
  ListQuestionsDto,
  ReorderQuestionsDto,
  UpdateQuestionDto,
} from './dto/questions.dto.js';
import { assertValidAnswer } from './question-answer.js';
import {
  assertValidEvidence,
  assertValidQuestionContent,
} from './question-content.js';

// Fixing a wrong key must stay possible after attempts exist
const LOCKED_EDITABLE_FIELDS = new Set(['answer', 'explanation', 'evidence']);

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Question)
    private questionRepository: Repository<Question>,
    private testsService: TestsService,
    private questionGroupsService: QuestionGroupsService,
    private mediaValidator: MediaValidator,
    private dataSource: DataSource,
  ) {}

  async findAll({ groupId }: ListQuestionsDto) {
    await this.questionGroupsService.findGroupContext(groupId);

    return this.findByGroupId(groupId);
  }

  async findById(id: number) {
    const question = await this.adminQuery()
      .where('q.id = :id', { id })
      .getOne();
    if (!question) {
      throw new NotFoundException(`Question with ID ${id} not found`);
    }

    return question;
  }

  async create(dto: CreateQuestionDto) {
    const { group, test } = await this.questionGroupsService.findGroupContext(
      dto.groupId,
    );
    this.testsService.assertEditable(test);

    const numberTo = dto.numberTo ?? dto.numberFrom;
    assertValidAnswer(group.questionType, { ...dto, numberTo });
    assertValidQuestionContent(group.questionType, dto.content, dto.numberFrom);
    assertValidEvidence(dto.evidence, dto.numberFrom);
    await this.mediaValidator.assertKinds(dto);

    let { order } = dto;
    if (order === undefined) {
      const last = await this.questionRepository.maximum('order', {
        groupId: dto.groupId,
      });
      order = last === null ? 0 : last + 1;
    }

    const question = await this.questionRepository.save({
      ...dto,
      numberTo,
      order,
    });

    return this.findById(question.id);
  }

  async update(id: number, dto: UpdateQuestionDto) {
    const question = await this.findById(id);
    const { group, test } = await this.questionGroupsService.findGroupContext(
      question.groupId,
    );

    if (test.lockedAt) {
      const blocked = Object.keys(dto).filter(
        (field) => !LOCKED_EDITABLE_FIELDS.has(field),
      );
      if (blocked.length) {
        throw new BadRequestException(
          `Test with ID ${test.id} is locked; only answer, explanation and evidence can change (got ${blocked.join(', ')})`,
        );
      }
    }

    if (
      dto.answer !== undefined ||
      dto.numberFrom !== undefined ||
      dto.numberTo !== undefined
    ) {
      assertValidAnswer(group.questionType, { ...question, ...dto });
    }
    const numberFrom = dto.numberFrom ?? question.numberFrom;
    if (dto.content !== undefined) {
      assertValidQuestionContent(group.questionType, dto.content, numberFrom);
    }
    if (dto.evidence !== undefined) {
      assertValidEvidence(dto.evidence, numberFrom);
    }
    await this.mediaValidator.assertKinds(dto);

    await this.questionRepository.save({ id, ...dto });

    return this.findById(id);
  }

  async reorder({ groupId, ids }: ReorderQuestionsDto) {
    const { test } = await this.questionGroupsService.findGroupContext(groupId);
    this.testsService.assertEditable(test);

    const [matched, total] = await Promise.all([
      this.questionRepository.countBy({ id: In(ids), groupId }),
      this.questionRepository.countBy({ groupId }),
    ]);
    if (matched !== ids.length) {
      throw new BadRequestException(
        'One or more questions do not belong to this group',
      );
    }
    if (total !== ids.length) {
      throw new BadRequestException(
        `ids must include all ${total} questions of this group`,
      );
    }

    await this.dataSource.transaction((manager) =>
      Promise.all(
        ids.map((id, order) => manager.update(Question, id, { order })),
      ),
    );

    return this.findByGroupId(groupId);
  }

  async deleteByIds({ ids }: DeleteQuestionsDto) {
    const questions = await this.questionRepository
      .createQueryBuilder('q')
      .innerJoin('q.questionGroup', 'g')
      .innerJoin('g.testPart', 'p')
      .innerJoin('p.testSection', 's')
      .innerJoin('s.test', 't')
      .select(['q.id', 'g.id', 'p.id', 's.id', 't.id', 't.lockedAt'])
      .where('q.id IN (:...ids)', { ids })
      .getMany();

    for (const q of questions) {
      this.testsService.assertEditable(
        q.questionGroup.testPart.testSection.test,
      );
    }

    if (!questions.length) {
      return { deleted: 0 };
    }

    const result = await this.questionRepository.delete({
      id: In(questions.map((q) => q.id)),
    });

    return { deleted: result.affected ?? 0 };
  }

  private findByGroupId(groupId: number) {
    return this.adminQuery()
      .where('q.groupId = :groupId', { groupId })
      .orderBy('q.order', 'ASC')
      .addOrderBy('q.id', 'ASC')
      .getMany();
  }

  // Backoffice view: answer columns are select:false on the entity
  private adminQuery() {
    return this.questionRepository
      .createQueryBuilder('q')
      .addSelect(['q.answer', 'q.explanation', 'q.evidence']);
  }
}
