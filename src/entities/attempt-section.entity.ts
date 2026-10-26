import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { AttemptSectionStatus } from '../types/attempt.type.js';
import { Attempt } from './attempt.entity.js';
import { numericTransformer } from './numeric.transformer.js';
import { TestSection } from './test-section.entity.js';

// FULL creates a row for every section of the test, SECTION only for the
// chosen ones; autosave must check the deadline of the question's section
@Entity('attempt_sections', { schema: 'public' })
@Index(
  'uq_attempt_sections_attempt_id_section_id',
  ['attemptId', 'sectionId'],
  { unique: true },
)
export class AttemptSection {
  @PrimaryGeneratedColumn('uuid', { name: 'attempt_section_id' })
  id: string;

  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId: string;

  @Column({ name: 'section_id', type: 'int' })
  sectionId: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttemptSectionStatus,
    enumName: 'attempt_section_status_enum',
    default: AttemptSectionStatus.NOT_STARTED,
  })
  status: AttemptSectionStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  // started_at + section.duration_minutes, computed by the server
  @Column({ name: 'deadline_at', type: 'timestamptz', nullable: true })
  deadlineAt?: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date | null;

  @Column({ name: 'raw_score', type: 'int', nullable: true })
  rawScore?: number | null;

  @Column({ name: 'max_score', type: 'int', nullable: true })
  maxScore?: number | null;

  @Column({
    name: 'scaled_score',
    type: 'numeric',
    precision: 5,
    scale: 1,
    nullable: true,
    transformer: numericTransformer,
  })
  scaledScore?: number | null;

  @ManyToOne(() => Attempt, (attempt) => attempt.attemptSections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attempt_id', referencedColumnName: 'id' })
  attempt: Relation<Attempt>;

  @ManyToOne(() => TestSection)
  @JoinColumn({ name: 'section_id', referencedColumnName: 'id' })
  testSection: Relation<TestSection>;
}
