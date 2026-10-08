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

// One row per login session; refresh rotates the row in place instead of
// inserting, so the table grows with sessions, not with refreshes.
@Entity('auth_sessions', { schema: 'public' })
@Index('idx_auth_sessions_user_id_client', ['userId', 'client'])
@Index('idx_auth_sessions_expires_at', ['expiresAt'])
export class AuthSession {
  // Matches the `sid` claim of the refresh JWT.
  @PrimaryColumn('uuid', { name: 'auth_session_id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: AuthClient.WEB,
  })
  client: AuthClient;

  // `jti` of the only refresh token currently accepted for this session.
  @Column({ name: 'current_jti', type: 'uuid' })
  currentJti: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  // Kept to tell a concurrent refresh (within the grace window) from a replay.
  @Column({ name: 'previous_jti', type: 'uuid', nullable: true })
  previousJti?: string | null;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt?: Date | null;

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
