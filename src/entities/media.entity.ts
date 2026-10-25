import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { MediaKind, MediaScope } from '../types/media.type.js';
import { AuditMetadata } from './audit-metadata.entity.js';

// Owner is polymorphic (test id, user uuid, ...), so there is no FK to it;
// MediaService checks the owner per scope before issuing or registering a key.
// LIBRARY media is shared and has no owner
@Entity('media', { schema: 'public' })
@Index('idx_media_scope_owner', ['scope', 'ownerId'])
export class Media {
  @PrimaryGeneratedColumn('increment', { name: 'media_id' })
  id: number;

  @Column({
    name: 'scope',
    type: 'enum',
    enum: MediaScope,
    enumName: 'media_scope_enum',
  })
  scope: MediaScope;

  @Column({ name: 'owner_id', type: 'varchar', length: 64, nullable: true })
  ownerId: string | null;

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
}
