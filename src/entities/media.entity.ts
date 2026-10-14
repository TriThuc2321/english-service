import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { MediaKind } from '../types/test.type.js';
import { AuditMetadata } from './audit-metadata.entity.js';
import { Test } from './test.entity.js';

@Entity('media', { schema: 'public' })
@Index('idx_media_test_id', ['testId'])
export class Media {
  @PrimaryGeneratedColumn('increment', { name: 'media_id' })
  id: number;

  @Column({ name: 'test_id', type: 'int' })
  testId: number;

  @Column({
    name: 'kind',
    type: 'enum',
    enum: MediaKind,
    enumName: 'media_kind_enum',
  })
  kind: MediaKind;

  // Public URL is built from the key at response time (STORAGE_PUBLIC_URL)
  @Column({ name: 'storage_key', type: 'varchar', length: 500, unique: true })
  storageKey: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType?: string | null;

  // pg returns bigint as string to avoid precision loss
  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes?: string | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs?: number | null;

  @Column({ name: 'transcript', type: 'text', nullable: true })
  transcript?: string | null;

  @Column(() => AuditMetadata, { prefix: false })
  auditMetadata: AuditMetadata;

  // Tests are soft-deleted, so this only guards against dangling ids
  @ManyToOne(() => Test, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'test_id', referencedColumnName: 'id' })
  test: Relation<Test>;
}
