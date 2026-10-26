import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { AttemptMode, AttemptStatus } from '../types/attempt.type.js';
import { AttemptAnswer } from './attempt-answer.entity.js';
import { AttemptSection } from './attempt-section.entity.js';
import { AuditMetadata } from './audit-metadata.entity.js';
import { numericTransformer } from './numeric.transformer.js';
import { Test } from './test.entity.js';
import { User } from './user.entity.js';

// No scheduler: an attempt past its deadline (+ grace) is auto-submitted and
// graded lazily on the next read/save, ending as EXPIRED with its scores
@Entity('attempts', { schema: 'public' })
@Index('idx_attempts_user_id_started_at', ['userId', 'startedAt'])
@Index('idx_attempts_user_id_test_id', ['userId', 'testId'])
@Index('uq_attempts_user_id_test_id_in_progress', ['userId', 'testId'], {
  unique: true,
  where: `"status" = '${AttemptStatus.IN_PROGRESS}'`,
})
export class Attempt {
  @PrimaryGeneratedColumn('uuid', { name: 'attempt_id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'test_id', type: 'int' })
  testId: number;

  @Column({
    name: 'mode',
    type: 'enum',
    enum: AttemptMode,
    enumName: 'attempt_mode_enum',
  })
  mode: AttemptMode;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttemptStatus,
    enumName: 'attempt_status_enum',
    default: AttemptStatus.IN_PROGRESS,
  })
  status: AttemptStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  // Overall limit (TOEIC LR); IELTS uses each attempt section's deadline
  @Column({ name: 'deadline_at', type: 'timestamptz', nullable: true })
  deadlineAt?: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date | null;

  // TOEIC = L + R; IELTS stays null until all four skills exist (phase 2)
  @Column({
    name: 'overall_score',
    type: 'numeric',
    precision: 5,
    scale: 1,
    nullable: true,
    transformer: numericTransformer,
  })
  overallScore?: number | null;

  @Column(() => AuditMetadata, { prefix: false })
  auditMetadata: AuditMetadata;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: Relation<User>;

  @ManyToOne(() => Test)
  @JoinColumn({ name: 'test_id', referencedColumnName: 'id' })
  test: Relation<Test>;

  @OneToMany(() => AttemptSection, (section) => section.attempt, {
    cascade: ['insert'],
  })
  attemptSections: Relation<AttemptSection>[];

  @OneToMany(() => AttemptAnswer, (answer) => answer.attempt, {
    cascade: ['insert'],
  })
  attemptAnswers: Relation<AttemptAnswer>[];
}
