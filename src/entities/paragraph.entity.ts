import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { Passage } from './passage.entity.js';

@Entity('paragraphs', { schema: 'public' })
@Index('idx_paragraphs_passage_id', ['passageId'])
export class Paragraph {
  @PrimaryGeneratedColumn('increment', { name: 'paragraph_id' })
  id: number;

  @Column({ name: 'content', type: 'text', nullable: false })
  content: string;

  @Column({ name: 'order', type: 'int', default: 0 })
  order: number;

  @Column({ name: 'passage_id', type: 'int' })
  passageId: number;

  @ManyToOne(() => Passage, (passage) => passage.paragraphs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'passage_id', referencedColumnName: 'id' })
  passage: Relation<Passage>;
}
