import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { Status } from '../types/common.type.js';
import { AuditMetadata } from './audit-metadata.entity.js';
import { Paragraph } from './paragraph.entity.js';

export enum MarkedBy {
  ALPHABET = 'ALPHABET',
  NUMBER = 'NUMBER',
  NONE = 'NONE',
}

@Entity('passages', { schema: 'public' })
@Index('idx_passages_status', ['status'])
export class Passage {
  @PrimaryGeneratedColumn('increment', { name: 'passage_id' })
  id: number;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'subtitle', type: 'varchar', length: 255, nullable: true })
  subtitle?: string | null;

  @Column({
    name: 'marked_by',
    type: 'enum',
    enum: MarkedBy,
    enumName: 'marked_by_enum',
    default: MarkedBy.NONE,
  })
  markedBy: MarkedBy;

  @Column({
    name: 'status',
    type: 'enum',
    enum: Status,
    enumName: 'status_enum',
    default: Status.ACTIVE,
  })
  status: Status;

  @Column(() => AuditMetadata, { prefix: false })
  auditMetadata: AuditMetadata;

  @OneToMany(() => Paragraph, (paragraph) => paragraph.passage, {
    cascade: ['insert'],
  })
  paragraphs: Relation<Paragraph>[];
}
