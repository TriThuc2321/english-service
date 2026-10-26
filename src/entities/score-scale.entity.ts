import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { ExamType, SkillType } from '../types/test.type.js';
import { numericTransformer } from './numeric.transformer.js';
import { Test } from './test.entity.js';

// One row per raw score (no ranges). A row with test_id overrides the default
// scale (test_id null) for that test
@Entity('score_scales', { schema: 'public' })
@Index('uq_score_scales_default', ['examType', 'skill', 'rawScore'], {
  unique: true,
  where: '"test_id" IS NULL',
})
@Index('uq_score_scales_test', ['testId', 'skill', 'rawScore'], {
  unique: true,
  where: '"test_id" IS NOT NULL',
})
export class ScoreScale {
  @PrimaryGeneratedColumn('increment', { name: 'score_scale_id' })
  id: number;

  @Column({
    name: 'exam_type',
    type: 'enum',
    enum: ExamType,
    enumName: 'exam_type_enum',
  })
  examType: ExamType;

  @Column({
    name: 'skill',
    type: 'enum',
    enum: SkillType,
    enumName: 'skill_enum',
  })
  skill: SkillType;

  @Column({ name: 'test_id', type: 'int', nullable: true })
  testId?: number | null;

  @Column({ name: 'raw_score', type: 'int' })
  rawScore: number;

  @Column({
    name: 'scaled_score',
    type: 'numeric',
    precision: 5,
    scale: 1,
    transformer: numericTransformer,
  })
  scaledScore: number;

  @ManyToOne(() => Test, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'test_id', referencedColumnName: 'id' })
  test?: Relation<Test> | null;
}
