import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import { Brackets, In, Not, Repository } from 'typeorm';

import { Role } from '../../entities/role.entity.js';
import { User } from '../../entities/user.entity.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import { Status } from '../../types/common.type.js';
import {
  CreateUserDto,
  DeleteUsersDto,
  ListUsersDto,
  UpdateUserDto,
} from './dto/users.dto.js';

const BCRYPT_ROUNDS = 10;

const LIST_COLUMNS = [
  'u.id',
  'u.email',
  'u.firstName',
  'u.lastName',
  'u.avatar',
  'u.phone',
  'u.emailVerified',
  'u.provider',
  'u.status',
  'u.roleId',
  'u.auditMetadata.createdAt',
  'u.auditMetadata.createdById',
  'u.auditMetadata.updatedAt',
  'u.auditMetadata.updatedById',
  'r.id',
  'r.name',
  'r.code',
  'r.canAccessCms',
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

const DETAIL_COLUMNS = [...LIST_COLUMNS, 'u.address', 'u.dateOfBirth'];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Role) private roleRepository: Repository<Role>,
  ) {}

  private baseQuery(columns: string[]) {
    return this.userRepository
      .createQueryBuilder('u')
      .leftJoin('u.role', 'r')
      .leftJoin('u.auditMetadata.createdBy', 'creator')
      .leftJoin('u.auditMetadata.updatedBy', 'updater')
      .select(columns)
      .where('u.status != :deleted', { deleted: Status.DELETED });
  }

  async findAll({ page, take, search, roleId, status }: ListUsersDto) {
    const qb = this.baseQuery(LIST_COLUMNS);

    if (status) {
      qb.andWhere('u.status = :status', { status });
    }
    if (roleId !== undefined) {
      qb.andWhere('u.roleId = :roleId', { roleId });
    }
    if (search) {
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('u.email ILIKE :search')
            .orWhere('u.firstName ILIKE :search')
            .orWhere('u.lastName ILIKE :search')
            .orWhere('u.phone ILIKE :search'),
        ),
        { search: `%${search}%` },
      );
    }

    const [data, totalCount] = await qb
      .orderBy('u.auditMetadata.createdAt', 'DESC')
      .skip((page - 1) * take)
      .take(take)
      .getManyAndCount();

    return new PaginationDto(data, new PageMetaDto({ page, take, totalCount }));
  }

  async findById(id: string) {
    const user = await this.baseQuery(DETAIL_COLUMNS)
      .andWhere('u.id = :id', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async create(dto: CreateUserDto, actorId?: string) {
    const [emailTaken] = await Promise.all([
      this.userRepository.exists({
        where: { email: dto.email, status: Not(Status.DELETED) },
      }),
      this.assertRoleActive(dto.roleId),
    ]);
    if (emailTaken) {
      throw new ConflictException('Email is already in use');
    }

    const { password, ...rest } = dto;
    const user = await this.userRepository.save({
      ...rest,
      password: password ? await hash(password, BCRYPT_ROUNDS) : null,
      auditMetadata: { createdById: actorId },
    });

    return this.findById(user.id);
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.userRepository.findOne({
      where: { id, status: Not(Status.DELETED) },
      select: { id: true, roleId: true },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    if (dto.roleId !== undefined && dto.roleId !== user.roleId) {
      await this.assertRoleActive(dto.roleId);
    }

    await this.userRepository.update(id, {
      ...dto,
      auditMetadata: { updatedAt: new Date(), updatedById: actorId },
    });

    return this.findById(id);
  }

  async deleteByIds({ ids }: DeleteUsersDto, actorId: string) {
    if (ids.includes(actorId)) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const deleted = await this.userRepository.manager.transaction(
      async (manager) => {
        const result = await manager.update(
          User,
          { id: In(ids), status: Not(Status.DELETED) },
          {
            status: Status.DELETED,
            auditMetadata: { updatedAt: new Date(), updatedById: actorId },
          },
        );
        // A soft-deleted user must not be able to refresh into a new session.
        await manager.query(
          `UPDATE refresh_tokens SET revoked_at = NOW()
           WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL`,
          [ids],
        );
        return result.affected ?? 0;
      },
    );

    return { deleted };
  }

  private async assertRoleActive(roleId: number) {
    const exists = await this.roleRepository.exists({
      where: { id: roleId, status: Status.ACTIVE },
    });
    if (!exists) {
      throw new BadRequestException(`Role with ID ${roleId} not found`);
    }
  }
}
