import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { Permission } from '../../entities/permission.entity.js';
import { PermissionAction, PermissionSubject } from '../../types/auth.type.js';
import { Status } from '../../types/common.type.js';

@Injectable()
export class PermissionsService implements OnModuleInit {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async onModuleInit() {
    const existing = await this.permissionRepository.find({
      select: { action: true, subject: true },
      where: { status: Not(Status.DELETED) },
    });
    const existingKeys = new Set(
      existing.map((p) => `${p.action}:${p.subject}`),
    );

    const missing = Object.values(PermissionAction)
      .flatMap((action) =>
        Object.values(PermissionSubject).map((subject) => ({
          action,
          subject,
        })),
      )
      .filter(
        ({ action, subject }) => !existingKeys.has(`${action}:${subject}`),
      );
    if (missing.length) {
      await this.permissionRepository.save(missing);
    }
  }

  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.find({
      select: {
        id: true,
        action: true,
        subject: true,
        status: true,
      },
      where: {
        status: Status.ACTIVE,
      },
      order: {
        id: 'ASC',
      },
    });
  }
}
