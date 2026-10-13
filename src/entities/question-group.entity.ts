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

import { QuestionType } from '../types/test.type.js';
import { GroupPassage } from './group-passage.entity.js';
import { Media } from './media.entity.js';
import { Question } from './question.entity.js';
import { TestPart } from './test-part.entity.js';

@Entity('question_groups', { schema: 'public' })
@Index('idx_question_groups_part_id', ['partId'])
export class QuestionGroup {
  @PrimaryGeneratedColumn('increment', { name: 'group_id' })
  id: number;

  @Column({ name: 'part_id', type: 'int' })
  partId: number;

  @Column({ name: 'order', type: 'int' })
  order: number;

  @Column({
    name: 'question_type',
    type: 'enum',
    enum: QuestionType,
    enumName: 'question_type_enum',
  })
  questionType: QuestionType;

  @Column({ name: 'instruction', type: 'text', nullable: true })
  instruction?: string | null;

  // "NO MORE THAN TWO WORDS" -> 2
  @Column({ name: 'word_limit', type: 'int', nullable: true })
  wordLimit?: number | null;

  // Shared options (headings, features, endings), templates with {{n}}
  // placeholders that must match questions.number_from, or table structure
  @Column({ name: 'content', type: 'jsonb', nullable: true })
  content?: Record<string, unknown> | null;

  @Column({ name: 'audio_media_id', type: 'int', nullable: true })
  audioMediaId?: number | null;

  @Column({ name: 'image_media_id', type: 'int', nullable: true })
  imageMediaId?: number | null;

  @ManyToOne(() => TestPart, (part) => part.questionGroups, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'part_id', referencedColumnName: 'id' })
  testPart: Relation<TestPart>;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'audio_media_id', referencedColumnName: 'id' })
  audioMedia?: Relation<Media> | null;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'image_media_id', referencedColumnName: 'id' })
  imageMedia?: Relation<Media> | null;

  @OneToMany(() => Question, (question) => question.questionGroup, {
    cascade: ['insert'],
  })
  questions: Relation<Question>[];

  @OneToMany(() => GroupPassage, (gp) => gp.questionGroup, {
    cascade: ['insert'],
  })
  groupPassages: Relation<GroupPassage>[];
}
