import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { MediaKind } from '../types/test.type.js';
import { AuditMetadata } from './audit-metadata.entity.js';

@Entity('media', { schema: 'public' })
export class Media {
  @PrimaryGeneratedColumn('increment', { name: 'media_id' })
  id: number;

  @Column({
    name: 'kind',
    type: 'enum',
    enum: MediaKind,
    enumName: 'media_kind_enum',
  })
  kind: MediaKind;

  // Public URL is built from the key at response time (STORAGE_PUBLIC_URL)
  @Column({ name: 'storage_key', type: 'varchar', length: 500 })
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
}
