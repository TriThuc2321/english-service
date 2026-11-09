import { createHash } from 'node:crypto';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { EmailCodePurpose } from '../types/auth.type.js';
import { AuditMetadata } from './audit-metadata.entity.js';
import { User } from './user.entity.js';

// One row per (user, purpose): a new code overwrites the previous one, so only
// the latest code sent is ever valid.
@Entity('email_codes', { schema: 'public' })
@Index('uq_email_codes_user_purpose', ['userId', 'purpose'], { unique: true })
export class EmailCode {
  @PrimaryGeneratedColumn({ name: 'email_code_id' })
  id: number;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    name: 'purpose',
    type: 'enum',
    enum: EmailCodePurpose,
    enumName: 'email_code_purpose_enum',
  })
  purpose: EmailCodePurpose;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash: string;

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt?: Date | null;

  @Column(() => AuditMetadata, { prefix: false })
  auditMetadata: AuditMetadata;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: Relation<User>;

  static hash(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }
}
