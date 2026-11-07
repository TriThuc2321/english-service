import type { EntityManager } from 'typeorm';

import { Assessment } from '../../entities/assessment.entity.js';

export async function findLatestAssessments(
  manager: EntityManager,
  attemptSectionIds: string[],
): Promise<Map<string, Assessment>> {
  if (!attemptSectionIds.length) return new Map();
  const rows = await manager
    .getRepository(Assessment)
    .createQueryBuilder('x')
    .distinctOn(['x.attempt_section_id'])
    .where('x.attempt_section_id IN (:...attemptSectionIds)', {
      attemptSectionIds,
    })
    .orderBy('x.attempt_section_id')
    .addOrderBy('x.revision', 'DESC')
    .getMany();
  return new Map(rows.map((r) => [r.attemptSectionId, r]));
}
