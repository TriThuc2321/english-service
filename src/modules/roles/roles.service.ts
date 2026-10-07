import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Not, Repository } from 'typeorm';

import { Permission } from '../../entities/permission.entity.js';
import { Role } from '../../entities/role.entity.js';
import { User } from '../../entities/user.entity.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import { Status } from '../../types/common.type.js';
import {
  CreateRoleDto,
  DeleteRolesDto,
  ListRolesDto,
  UpdateRoleDto,
} from './dto/roles.dto.js';
import { SYSTEM_ROLES, SystemRoleCode } from './roles.constant.js';

const LIST_COLUMNS = [
  'r.id',
  'r.name',
  'r.code',
  'r.canAccessCms',
  'r.status',
  'r.systemRole',
  'r.auditMetadata.createdAt',
  'r.auditMetadata.createdById',
  'r.auditMetadata.updatedAt',
  'r.auditMetadata.updatedById',
  'creator.id',
  'creator.email',
  'creator.firstName',
  'creator.lastName',
  'creator.avatar',
  'updater.id',
  'updater.email',
  'updater.firstName',
  'updater.lastName',
  'updater.avatar',
];

const DETAIL_COLUMNS = [...LIST_COLUMNS, 'p.id', 'p.action', 'p.subject'];

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @InjectRepository(Role) private roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {}

  // There are no migrations/seeders, so system roles are created on boot.
  async onModuleInit() {
    const existing = await this.roleRepository.find({
      where: { code: In(Object.values(SystemRoleCode)) },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((r) => r.code));

    const missing = Object.entries(SYSTEM_ROLES)
      .filter(([code]) => !existingCodes.has(code))
      .map(([code, role]) => ({ ...role, code, systemRole: true }));
    if (missing.length) {
      await this.roleRepository.save(missing);
    }
  }

  private baseQuery(columns: string[]) {
    return this.roleRepository
      .createQueryBuilder('r')
      .leftJoin('r.auditMetadata.createdBy', 'creator')
      .leftJoin('r.auditMetadata.updatedBy', 'updater')
      .select(columns)
      .where('r.status != :deleted', { deleted: Status.DELETED });
  }

  async findAll({ page, take, search, status, canAccessCms }: ListRolesDto) {
    const qb = this.baseQuery(LIST_COLUMNS);

    if (status) {
      qb.andWhere('r.status = :status', { status });
    }
    if (canAccessCms !== undefined) {
      qb.andWhere('r.canAccessCms = :canAccessCms', { canAccessCms });
    }
    if (search) {
      qb.andWhere(
        new Brackets((w) =>
          w.where('r.name ILIKE :search').orWhere('r.code ILIKE :search'),
        ),
        { search: `%${search}%` },
      );
    }

    const [data, totalCount] = await qb
      .orderBy('r.auditMetadata.createdAt', 'DESC')
      .skip((page - 1) * take)
      .take(take)
      .getManyAndCount();

    return new PaginationDto(data, new PageMetaDto({ page, take, totalCount }));
  }

  async findById(id: number) {
    const role = await this.baseQuery(DETAIL_COLUMNS)
      .leftJoin('r.permissions', 'p', 'p.status = :active', {
        active: Status.ACTIVE,
      })
      .andWhere('r.id = :id', { id })
      .getOne();

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    return role;
  }

  async create(dto: CreateRoleDto, actorId: string) {
    const { permissionIds, ...rest } = dto;
    const [codeTaken, permissions] = await Promise.all([
      this.isCodeTaken(dto.code),
      this.loadPermissions(permissionIds),
    ]);
    if (codeTaken) {
      throw new ConflictException('Role code is already in use');
    }

    const role = await this.roleRepository.save({
      ...rest,
      permissions,
      auditMetadata: { createdById: actorId },
    });

    return this.findById(role.id);
  }

  async update(id: number, dto: UpdateRoleDto, actorId: string) {
    const role = await this.roleRepository.findOne({
      where: { id, status: Not(Status.DELETED) },
    });
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    const { permissionIds, ...rest } = dto;
    const [codeTaken, permissions] = await Promise.all([
      dto.code !== undefined && dto.code !== role.code
        ? this.isCodeTaken(dto.code, id)
        : false,
      this.loadPermissions(permissionIds),
    ]);
    if (codeTaken) {
      throw new ConflictException('Role code is already in use');
    }
    if (
      role.systemRole &&
      ((dto.code !== undefined && dto.code !== role.code) ||
        dto.status === Status.INACTIVE)
    ) {
      throw new ConflictException(
        'System roles cannot be renamed by code or deactivated',
      );
    }

    // Many-to-many changes are only persisted through save(), not update().
    await this.roleRepository.save({
      ...role,
      ...rest,
      ...(permissions && { permissions }),
      auditMetadata: {
        ...role.auditMetadata,
        updatedAt: new Date(),
        updatedById: actorId,
      },
    });

    return this.findById(id);
  }

  async deleteByIds({ ids }: DeleteRolesDto, actorId: string) {
    const [inUse, isSystem] = await Promise.all([
      this.userRepository.exists({
        where: { roleId: In(ids), status: Not(Status.DELETED) },
      }),
      this.roleRepository.exists({
        where: { id: In(ids), systemRole: true, status: Not(Status.DELETED) },
      }),
    ]);
    if (isSystem) {
      throw new ConflictException('System roles cannot be deleted');
    }
    if (inUse) {
      throw new ConflictException(
        'One or more roles are still assigned to users',
      );
    }

    const result = await this.roleRepository.update(
      { id: In(ids), status: Not(Status.DELETED) },
      {
        status: Status.DELETED,
        auditMetadata: { updatedAt: new Date(), updatedById: actorId },
      },
    );

    return { deleted: result.affected ?? 0 };
  }

  private isCodeTaken(code: string, excludeId?: number) {
    return this.roleRepository.exists({
      where: {
        code,
        status: Not(Status.DELETED),
        ...(excludeId !== undefined && { id: Not(excludeId) }),
      },
    });
  }

  private async loadPermissions(ids?: number[]) {
    if (ids === undefined) {
      return undefined;
    }
    if (ids.length === 0) {
      return [];
    }

    const permissions = await this.permissionRepository.findBy({
      id: In(ids),
      status: Status.ACTIVE,
    });
    if (permissions.length !== ids.length) {
      throw new BadRequestException('One or more permissions not found');
    }

    return permissions;
  }
}
