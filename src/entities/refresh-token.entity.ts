import { createHash } from 'node:crypto';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';

import { AuthClient } from '../types/auth.type.js';
import { AuditMetadata } from './audit-metadata.entity.js';
import { User } from './user.entity.js';

@Entity('refresh_tokens', { schema: 'public' })
@Index('idx_refresh_tokens_user_id_client', ['userId', 'client'])
@Index('idx_refresh_tokens_expires_at', ['expiresAt'])
export class RefreshToken {
  // Matches the `jti` claim of the refresh JWT.
  @PrimaryColumn('uuid', { name: 'refresh_token_id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: AuthClient.WEB,
  })
  client: AuthClient;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @Column(() => AuditMetadata, { prefix: false })
  auditMetadata: AuditMetadata;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: Relation<User>;

  static hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
