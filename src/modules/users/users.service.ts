import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import { Brackets, In, Not, Repository } from 'typeorm';

import { Role } from '../../entities/role.entity.js';
import { User } from '../../entities/user.entity.js';
import { CaslAbilityFactory } from '../../shared/casl/casl-ability.factory.js';
import { PageMetaDto, PaginationDto } from '../../shared/dto/index.js';
import {
  type ITokenPayload,
  PermissionAction,
  PermissionSubject,
} from '../../types/auth.type.js';
import { Status } from '../../types/common.type.js';
import { MediaKind, MediaScope } from '../../types/media.type.js';
import { MediaService } from '../media/media.service.js';
import {
  CreateUserDto,
  DeleteUsersDto,
  ListUsersDto,
  UpdateUserDto,
} from './dto/users.dto.js';

export const BCRYPT_ROUNDS = 10;

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
  'u.systemUser',
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

const DETAIL_COLUMNS = [
  ...LIST_COLUMNS,
  'u.address',
  'u.dateOfBirth',
  'u.avatarMediaId',
];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Role) private roleRepository: Repository<Role>,
    private mediaService: MediaService,
    private caslAbilityFactory: CaslAbilityFactory,
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

  async create(
    dto: CreateUserDto & { avatar?: string },
    actor?: ITokenPayload,
  ) {
    if (actor) {
      await this.assertCanManage(actor, [{ roleId: dto.roleId }]);
    }
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
      auditMetadata: { createdById: actor?.id },
    });

    return this.findById(user.id);
  }

  async update(id: string, dto: UpdateUserDto, actor: ITokenPayload) {
    const { avatarMediaId, ...rest } = dto;
    const user = await this.findExistingUser(id);
    await this.assertCanManage(actor, [
      user,
      ...(rest.roleId === undefined ? [] : [{ roleId: rest.roleId }]),
    ]);
    if (rest.roleId !== undefined && rest.roleId !== user.roleId) {
      await this.assertRoleActive(rest.roleId);
    }

    const avatar =
      avatarMediaId === undefined
        ? {}
        : await this.resolveAvatar(id, avatarMediaId);

    await this.userRepository.update(id, {
      ...rest,
      ...avatar,
      auditMetadata: { updatedAt: new Date(), updatedById: actor.id },
    });
    await this.cleanupReplacedAvatar(user, avatarMediaId);

    return this.findById(id);
  }

  async setAvatar(id: string, avatarMediaId: number | null, actorId: string) {
    const user = await this.findExistingUser(id);
    const avatar = await this.resolveAvatar(id, avatarMediaId);

    await this.userRepository.update(id, {
      ...avatar,
      auditMetadata: { updatedAt: new Date(), updatedById: actorId },
    });
    await this.cleanupReplacedAvatar(user, avatarMediaId);

    return { avatar: avatar.avatar };
  }

  private async findExistingUser(id: string) {
    const user = await this.userRepository.findOne({
      where: { id, status: Not(Status.DELETED) },
      select: { id: true, roleId: true, avatarMediaId: true, systemUser: true },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  private async resolveAvatar(userId: string, avatarMediaId: number | null) {
    if (avatarMediaId === null) {
      return { avatarMediaId: null, avatar: null };
    }

    const media = await this.mediaService.findOwned(avatarMediaId, {
      scope: MediaScope.AVATAR,
      ownerId: userId,
      kind: MediaKind.IMAGE,
    });

    return { avatarMediaId: media.id, avatar: media.url };
  }

  private async cleanupReplacedAvatar(
    user: Pick<User, 'avatarMediaId'>,
    nextMediaId: number | null | undefined,
  ) {
    if (
      nextMediaId !== undefined &&
      user.avatarMediaId &&
      user.avatarMediaId !== nextMediaId
    ) {
      await this.mediaService.deleteQuietly(user.avatarMediaId);
    }
  }

  async deleteByIds({ ids }: DeleteUsersDto, actor: ITokenPayload) {
    const actorId = actor.id;
    if (ids.includes(actorId)) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.assertCanManage(
      actor,
      await this.userRepository.find({
        where: { id: In(ids), status: Not(Status.DELETED) },
        select: { id: true, roleId: true, systemUser: true },
      }),
    );

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
          `UPDATE auth_sessions SET revoked_at = NOW()
           WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL`,
          [ids],
        );
        return result.affected ?? 0;
      },
    );

    return { deleted };
  }

  private async assertCanManage(
    actor: ITokenPayload,
    targets: Array<
      Partial<Pick<User, 'id' | 'systemUser'>> & { roleId: number }
    >,
  ) {
    const ability = this.caslAbilityFactory.createForUser(actor);
    const isSuperAdmin = ability.can(
      PermissionAction.MANAGE,
      PermissionSubject.ALL,
    );
    if (
      !isSuperAdmin &&
      targets.some((t) => t.systemUser && t.id !== actor.id)
    ) {
      throw new ForbiddenException(
        'System users can only be managed by a super admin',
      );
    }

    const roles = await this.roleRepository.find({
      where: { id: In([...new Set(targets.map((t) => t.roleId))]) },
      relations: { permissions: true },
      select: {
        id: true,
        permissions: { id: true, action: true, subject: true, status: true },
      },
    });
    const exceeds = roles.some((role) =>
      role.permissions.some(
        ({ action, subject, status }) =>
          status === Status.ACTIVE &&
          !ability.can(
            action as PermissionAction,
            subject as PermissionSubject,
          ),
      ),
    );
    if (exceeds) {
      throw new ForbiddenException(
        'You cannot manage a user whose role grants permissions you do not hold',
      );
    }
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
