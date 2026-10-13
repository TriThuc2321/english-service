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

import { Media } from './media.entity.js';
import { QuestionGroup } from './question-group.entity.js';
import { TestSection } from './test-section.entity.js';

@Entity('test_parts', { schema: 'public' })
@Index('idx_test_parts_section_id', ['sectionId'])
export class TestPart {
  @PrimaryGeneratedColumn('increment', { name: 'part_id' })
  id: number;

  @Column({ name: 'section_id', type: 'int' })
  sectionId: number;

  @Column({ name: 'order', type: 'int' })
  order: number;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title?: string | null;

  @Column({ name: 'instruction', type: 'text', nullable: true })
  instruction?: string | null;

  @Column({ name: 'audio_media_id', type: 'int', nullable: true })
  audioMediaId?: number | null;

  // Start/end let several parts share one audio file
  @Column({ name: 'audio_start_ms', type: 'int', nullable: true })
  audioStartMs?: number | null;

  @Column({ name: 'audio_end_ms', type: 'int', nullable: true })
  audioEndMs?: number | null;

  @ManyToOne(() => TestSection, (section) => section.testParts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'section_id', referencedColumnName: 'id' })
  testSection: Relation<TestSection>;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'audio_media_id', referencedColumnName: 'id' })
  audioMedia?: Relation<Media> | null;

  @OneToMany(() => QuestionGroup, (group) => group.testPart, {
    cascade: ['insert'],
  })
  questionGroups: Relation<QuestionGroup>[];
}
