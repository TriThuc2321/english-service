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

import { SkillType } from '../types/test.type.js';
import { TestPart } from './test-part.entity.js';
import { Test } from './test.entity.js';

@Entity('test_sections', { schema: 'public' })
@Index('uq_test_sections_test_id_skill', ['testId', 'skill'], { unique: true })
export class TestSection {
  @PrimaryGeneratedColumn('increment', { name: 'section_id' })
  id: number;

  @Column({ name: 'test_id', type: 'int' })
  testId: number;

  @Column({
    name: 'skill',
    type: 'enum',
    enum: SkillType,
    enumName: 'skill_enum',
  })
  skill: SkillType;

  @Column({ name: 'order', type: 'int' })
  order: number;

  // IELTS: Listening 30 (+10 transfer), Reading 60. TOEIC: null
  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  durationMinutes?: number | null;

  @ManyToOne(() => Test, (test) => test.testSections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'test_id', referencedColumnName: 'id' })
  test: Relation<Test>;

  @OneToMany(() => TestPart, (part) => part.testSection, {
    cascade: ['insert'],
  })
  testParts: Relation<TestPart>[];
}
