import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { AuditMetadata } from './audit-metadata.entity.js';
import { Paragraph } from './paragraph.entity.js';

export enum MarkedBy {
  ALPHABET = 'ALPHABET',
  NUMBER = 'NUMBER',
  NONE = 'NONE',
}

export enum PassageStatus {
  PUBLISHED = 'PUBLISHED',
  DRAFT = 'DRAFT',
  DELETED = 'DELETED',
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
    enum: PassageStatus,
    enumName: 'status_passage_enum',
    default: PassageStatus.DRAFT,
  })
  status: PassageStatus;

  @Column(() => AuditMetadata, { prefix: false })
  auditMetadata: AuditMetadata;

  @OneToMany(() => Paragraph, (paragraph) => paragraph.passage, {
    cascade: ['insert'],
  })
  paragraphs: Relation<Paragraph>[];
}
