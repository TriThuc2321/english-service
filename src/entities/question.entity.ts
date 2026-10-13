import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { Media } from './media.entity.js';
import { QuestionGroup } from './question-group.entity.js';

// Max score of a question = number_to - number_from + 1 (e.g. "Choose TWO")
@Entity('questions', { schema: 'public' })
@Index('idx_questions_group_id', ['groupId'])
@Check('chk_questions_number_range', '"number_to" >= "number_from"')
export class Question {
  @PrimaryGeneratedColumn('increment', { name: 'question_id' })
  id: number;

  @Column({ name: 'group_id', type: 'int' })
  groupId: number;

  @Column({ name: 'number_from', type: 'int' })
  numberFrom: number;

  @Column({ name: 'number_to', type: 'int' })
  numberTo: number;

  @Column({ name: 'order', type: 'int' })
  order: number;

  @Column({ name: 'prompt', type: 'text', nullable: true })
  prompt?: string | null;

  @Column({ name: 'content', type: 'jsonb', nullable: true })
  content?: Record<string, unknown> | null;

  // answer/explanation/evidence are hidden by default so a test-taking query
  // can't leak them; admin queries must addSelect them explicitly
  @Column({ name: 'answer', type: 'jsonb', select: false })
  answer: Record<string, unknown>;

  @Column({ name: 'explanation', type: 'text', nullable: true, select: false })
  explanation?: string | null;

  @Column({ name: 'evidence', type: 'jsonb', nullable: true, select: false })
  evidence?: Record<string, unknown> | null;

  @Column({ name: 'audio_media_id', type: 'int', nullable: true })
  audioMediaId?: number | null;

  @Column({ name: 'image_media_id', type: 'int', nullable: true })
  imageMediaId?: number | null;

  @Column({ name: 'audio_start_ms', type: 'int', nullable: true })
  audioStartMs?: number | null;

  @ManyToOne(() => QuestionGroup, (group) => group.questions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'group_id', referencedColumnName: 'id' })
  questionGroup: Relation<QuestionGroup>;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'audio_media_id', referencedColumnName: 'id' })
  audioMedia?: Relation<Media> | null;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'image_media_id', referencedColumnName: 'id' })
  imageMedia?: Relation<Media> | null;
}
