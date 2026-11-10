import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import { DataSource, In, Not, Repository } from 'typeorm';

import { Permission } from '../../entities/permission.entity.js';
import { Role } from '../../entities/role.entity.js';
import { User } from '../../entities/user.entity.js';
import { Status } from '../../types/common.type.js';
import { Provider } from '../../types/user.type.js';
import { BCRYPT_ROUNDS } from '../users/users.service.js';
import {
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_USERS,
  SystemRoleCode,
} from './roles.constant.js';

// onApplicationBootstrap runs after every onModuleInit, so the permissions
// (PermissionsService) and system roles (RolesService) already exist.
@Injectable()
export class DefaultDataSeeder implements OnApplicationBootstrap {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.dataSource.isInitialized) return;

    const roles = await this.roleRepository.find({
      where: {
        code: In(Object.values(SystemRoleCode)),
        status: Not(Status.DELETED),
      },
      relations: { permissions: true },
    });

    await this.seedRolePermissions(roles);
    await this.seedUsers(roles);
  }

  // Only roles without any permission are filled, so CMS edits are kept.
  private async seedRolePermissions(roles: Role[]) {
    const permissions = await this.permissionRepository.findBy({
      status: Status.ACTIVE,
    });
    const byKey = new Map(
      permissions.map((p) => [`${p.action}:${p.subject}`, p]),
    );

    for (const role of roles) {
      const defaults = DEFAULT_ROLE_PERMISSIONS[role.code as SystemRoleCode];
      if (role.permissions.length || !defaults.length) continue;

      await this.roleRepository.save({
        ...role,
        permissions: defaults
          .map(([action, subject]) => byKey.get(`${action}:${subject}`))
          .filter((p): p is Permission => p !== undefined),
      });
    }
  }

  private async seedUsers(roles: Role[]) {
    const password = this.configService.get<string>('SEED_USER_PASSWORD');
    if (!password) return;

    const existing = await this.userRepository.find({
      where: {
        email: In(DEFAULT_USERS.map((u) => u.email)),
        status: Not(Status.DELETED),
      },
      select: { email: true },
    });
    const existingEmails = new Set(existing.map((u) => u.email));
    const roleIds = new Map(roles.map((r) => [r.code, r.id]));

    const missing = DEFAULT_USERS.filter(
      (u) => !existingEmails.has(u.email) && roleIds.has(u.roleCode),
    );
    if (!missing.length) return;

    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    await this.userRepository.save(
      missing.map(({ roleCode, ...user }) => ({
        ...user,
        password: passwordHash,
        provider: Provider.LOCAL,
        emailVerified: true,
        roleId: roleIds.get(roleCode),
      })),
    );
  }
}
