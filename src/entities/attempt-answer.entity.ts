import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';

import { Attempt } from './attempt.entity.js';
import { Question } from './question.entity.js';

@Entity('attempt_answers', { schema: 'public' })
@Index('idx_attempt_answers_question_id', ['questionId'])
export class AttemptAnswer {
  @PrimaryColumn({ name: 'attempt_id', type: 'uuid' })
  attemptId: string;

  @PrimaryColumn({ name: 'question_id', type: 'int' })
  questionId: number;

  @Column({ name: 'response', type: 'jsonb', nullable: true })
  response?: Record<string, unknown> | null;

  // Set at submit; null when left blank
  @Column({ name: 'is_correct', type: 'boolean', nullable: true })
  isCorrect?: boolean | null;

  // 0..(number_to - number_from + 1); "Choose TWO" scores each key, unordered
  @Column({ name: 'score', type: 'int', nullable: true })
  score?: number | null;

  @Column({ name: 'flagged', type: 'boolean', default: false })
  flagged: boolean;

  @Column({ name: 'answered_at', type: 'timestamptz', nullable: true })
  answeredAt?: Date | null;

  @ManyToOne(() => Attempt, (attempt) => attempt.attemptAnswers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attempt_id', referencedColumnName: 'id' })
  attempt: Relation<Attempt>;

  @ManyToOne(() => Question)
  @JoinColumn({ name: 'question_id', referencedColumnName: 'id' })
  question: Relation<Question>;
}
