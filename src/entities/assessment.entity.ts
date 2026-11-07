import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import type { IAssessmentDetails } from '../types/attempt.type.js';

import { AttemptSection } from './attempt-section.entity.js';
import { numericTransformer } from './numeric.transformer.js';
import { User } from './user.entity.js';

@Entity('assessments', { schema: 'public' })
@Index(
  'uq_assessments_attempt_section_id_revision',
  ['attemptSectionId', 'revision'],
  { unique: true },
)
export class Assessment {
  @PrimaryGeneratedColumn('uuid', { name: 'assessment_id' })
  id: string;

  @Column({ name: 'attempt_section_id', type: 'uuid' })
  attemptSectionId: string;

  @Column({ name: 'revision', type: 'int' })
  revision: number;

  @Column({ name: 'grader_id', type: 'uuid' })
  graderId: string;

  @Column({
    name: 'band',
    type: 'numeric',
    precision: 3,
    scale: 1,
    transformer: numericTransformer,
  })
  band: number;

  @Column({ name: 'details', type: 'jsonb' })
  details: IAssessmentDetails;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => AttemptSection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attempt_section_id', referencedColumnName: 'id' })
  attemptSection: Relation<AttemptSection>;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'grader_id', referencedColumnName: 'id' })
  grader: Relation<User>;
}
