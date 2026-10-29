import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, type DeepPartial, type EntityManager } from 'typeorm';

import { Passage } from '../../entities/passage.entity.js';
import { TestPart } from '../../entities/test-part.entity.js';
import { Test } from '../../entities/test.entity.js';
import { TestsService } from '../tests/tests.service.js';
import {
  ImportEvidenceDto,
  ImportPartDto,
  ImportTestDto,
} from './dto/test-import.dto.js';
import { validateTestImport } from './test-import.validator.js';

@Injectable()
export class TestImportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly testsService: TestsService,
  ) {}

  async import(dto: ImportTestDto, actorId: string) {
    const issues = validateTestImport(dto);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length) {
      throw new BadRequestException(
        errors.map((e) => `${e.path}: ${e.message}`),
      );
    }
    this.testsService.assertSkillsAllowed(
      dto.examType,
      dto.sections.map((s) => s.skill),
    );
    const slug = await this.testsService.resolveSlug(dto);

    const testId = await this.dataSource.transaction(async (manager) => {
      const testSections = [];
      for (const [order, section] of dto.sections.entries()) {
        const testParts = [];
        for (const [partOrder, part] of section.parts.entries()) {
          testParts.push(
            await this.buildPart(manager, part, partOrder, actorId),
          );
        }
        testSections.push({
          skill: section.skill,
          order,
          durationMinutes: section.durationMinutes,
          testParts,
        });
      }

      const test = await manager.save(Test, {
        examType: dto.examType,
        title: dto.title,
        slug,
        source: dto.source,
        durationMinutes: dto.durationMinutes,
        testSections,
        auditMetadata: { createdById: actorId },
      });
      return test.id;
    });

    return {
      test: await this.testsService.findById(testId),
      warnings: issues.filter((i) => i.severity === 'warning'),
    };
  }

  private async buildPart(
    manager: EntityManager,
    { passage: passageDto, groups, title, instruction }: ImportPartDto,
    order: number,
    actorId: string,
  ): Promise<DeepPartial<TestPart>> {
    const passage = passageDto
      ? await manager.save(Passage, {
          title: passageDto.title,
          subtitle: passageDto.subtitle,
          markedBy: passageDto.markedBy,
          paragraphs: passageDto.paragraphs.map((content, i) => ({
            content,
            order: i,
          })),
          auditMetadata: { createdById: actorId },
        })
      : null;

    return {
      order,
      title,
      instruction,
      passageId: passage?.id ?? null,
      questionGroups: groups.map((group, groupOrder) => ({
        order: groupOrder,
        questionType: group.questionType,
        instruction: group.instruction,
        wordLimit: group.wordLimit,
        content: group.content,
        questions: group.questions.map((q, questionOrder) => ({
          numberFrom: q.numberFrom,
          numberTo: q.numberTo ?? q.numberFrom,
          order: questionOrder,
          prompt: q.prompt,
          content: q.content,
          answer: q.answer,
          explanation: q.explanation,
          evidence: this.toEvidence(q.evidence, passage),
        })),
      })),
    };
  }

  private toEvidence(
    evidence: ImportEvidenceDto | null | undefined,
    passage: Passage | null,
  ) {
    if (!evidence) {
      return null;
    }
    const { paragraph, quote } = evidence;
    const paragraphId =
      paragraph === undefined
        ? undefined
        : passage?.paragraphs[paragraph - 1].id;

    return {
      ...(paragraphId !== undefined && { paragraphId }),
      ...(quote !== undefined && { quote }),
    };
  }
}
