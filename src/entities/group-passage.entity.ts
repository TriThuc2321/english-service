import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';

import { Passage } from './passage.entity.js';
import { QuestionGroup } from './question-group.entity.js';

// Explicit join entity (not @ManyToMany) because each link carries an order;
// TOEIC Part 7 groups can span 2-3 passages
@Entity('group_passages', { schema: 'public' })
@Index('idx_group_passages_passage_id', ['passageId'])
export class GroupPassage {
  @PrimaryColumn({ name: 'group_id', type: 'int' })
  groupId: number;

  @PrimaryColumn({ name: 'passage_id', type: 'int' })
  passageId: number;

  @Column({ name: 'order', type: 'int', default: 0 })
  order: number;

  @ManyToOne(() => QuestionGroup, (group) => group.groupPassages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'group_id', referencedColumnName: 'id' })
  questionGroup: Relation<QuestionGroup>;

  @ManyToOne(() => Passage, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'passage_id', referencedColumnName: 'id' })
  passage: Relation<Passage>;
}
