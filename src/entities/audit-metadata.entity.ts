import { Column, CreateDateColumn, JoinColumn, ManyToOne } from 'typeorm';

import type { User } from './user.entity.js';

export abstract class AuditMetadata {
  @CreateDateColumn({
    type: 'timestamp without time zone',
    name: 'created_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column('uuid', { name: 'created_by_id', nullable: true })
  createdById?: string | null;

  // string target avoids a circular import with user.entity.ts
  @ManyToOne('User', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User | null;

  @Column({
    type: 'timestamp without time zone',
    name: 'updated_at',
    nullable: true,
  })
  updatedAt?: Date | null;

  @Column('uuid', { name: 'updated_by_id', nullable: true })
  updatedById?: string | null;

  @ManyToOne('User', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'updated_by_id' })
  updatedBy?: User | null;
}
