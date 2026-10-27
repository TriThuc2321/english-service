import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { ExamType, TestStatus } from '../types/test.type.js';
import { AuditMetadata } from './audit-metadata.entity.js';
import { TestSection } from './test-section.entity.js';

@Entity('tests', { schema: 'public' })
@Index('idx_tests_exam_type', ['examType'])
@Index('idx_tests_status', ['status'])
@Index('uq_tests_slug', ['slug'], {
  unique: true,
  where: `"status" != '${TestStatus.DELETED}'`,
})
export class Test {
  @PrimaryGeneratedColumn('increment', { name: 'test_id' })
  id: number;

  @Column({
    name: 'exam_type',
    type: 'enum',
    enum: ExamType,
    enumName: 'exam_type_enum',
  })
  examType: ExamType;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'slug', type: 'varchar', length: 255 })
  slug: string;

  @Column({ name: 'source', type: 'varchar', length: 255, nullable: true })
  source?: string | null;

  // Overall limit (TOEIC LR = 120); IELTS times each section instead
  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  durationMinutes?: number | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: TestStatus,
    enumName: 'test_status_enum',
    default: TestStatus.DRAFT,
  })
  status: TestStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt?: Date | null;

  // Set on the first attempt; afterwards the structure must not change
  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt?: Date | null;

  @Column(() => AuditMetadata, { prefix: false })
  auditMetadata: AuditMetadata;

  @OneToMany(() => TestSection, (section) => section.test, {
    cascade: ['insert'],
  })
  testSections: Relation<TestSection>[];
}
