import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hashSync } from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { IsNull, LessThan, Repository } from 'typeorm';

import { type JWTConfig, jwtConfig } from '../../configs/jwt.config.js';
import { RefreshToken } from '../../entities/refresh-token.entity.js';
import { Role } from '../../entities/role.entity.js';
import { User } from '../../entities/user.entity.js';
import {
  AuthClient,
  IGoogleProfile,
  IRefreshTokenPayload,
  ITokenPayload,
  PermissionAction,
  PermissionSubject,
  UserErrorEnum,
} from '../../types/auth.type.js';
import { Status } from '../../types/common.type.js';
import { Provider } from '../../types/user.type.js';
import { SystemRoleCode } from '../roles/roles.constant.js';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/auth.dto.js';

const LOGIN_CODE_EXPIRES_IN = '60s';
const REFRESH_REUSE_GRACE_MS = 30_000;

const DUMMY_PASSWORD_HASH = hashSync(randomBytes(32).toString('hex'), 10);

const USER_TOKEN_SELECT = {
  password: true,
  email: true,
  id: true,
  emailVerified: true,
  role: {
    id: true,
    canAccessCms: true,
    permissions: true,
  },
} as const;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const COLUMNS = [
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
  'r.id',
  'r.name',
  'r.code',
  'r.canAccessCms',
  'p.id',
  'p.action',
  'p.subject',
];

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Role) private roleRepository: Repository<Role>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    @Inject(jwtConfig.KEY) private readonly jwt: JWTConfig,
  ) {}

  private comparePasswords(password: string, hashedPassword: string) {
    return compare(password, hashedPassword || DUMMY_PASSWORD_HASH);
  }

  private async verifyUser({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) {
    const user = await this.userRepository.findOne({
      where: { email, status: Status.ACTIVE },
      select: USER_TOKEN_SELECT,
      relations: {
        role: {
          permissions: true,
        },
      },
    });

    const isValidPassword = await this.comparePasswords(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !isValidPassword) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    if (!user.emailVerified) {
      throw new HttpException(
        {
          message: 'Email not verified',
          code: UserErrorEnum.EMAIL_NOT_VERIFIED,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return user;
  }

  private toTokenPayload(user: User, client: AuthClient): ITokenPayload {
    return {
      email: user.email ?? '',
      roleId: user.role?.id,
      id: user.id,
      client,
      permissions: (user.role?.permissions ?? [])
        .filter(({ status }) => status === Status.ACTIVE)
        .map(({ action, subject }) => ({
          action: action as PermissionAction,
          subject: subject as PermissionSubject,
        })),
    };
  }

  private assertClientAccess(user: User, client: AuthClient) {
    if (client === AuthClient.BO && !user.role?.canAccessCms) {
      throw new ForbiddenException({
        message: 'CMS access denied',
        code: UserErrorEnum.CMS_ACCESS_DENIED,
      });
    }
  }

  private async signRefreshToken(
    user: User,
    client: AuthClient,
    expiresIn: JWTConfig['refreshExpiresIn'],
  ) {
    const jti = randomUUID();
    const token = this.jwtService.sign(
      { sub: user.id, jti, client } satisfies IRefreshTokenPayload,
      { secret: this.jwt.secretRefresh, expiresIn },
    );
    const { exp } = this.jwtService.decode<{ exp: number }>(token);
    const expiresAt = new Date(exp * 1000);

    await this.refreshTokenRepository.save({
      id: jti,
      userId: user.id,
      client,
      tokenHash: RefreshToken.hash(token),
      expiresAt,
    });

    return { token, expiresAt };
  }

  async issueTokens(user: User, client: AuthClient): Promise<IssuedTokens> {
    const { token: refreshToken, expiresAt: refreshTokenExpiresAt } =
      await this.signRefreshToken(user, client, this.jwt.refreshExpiresIn);

    this.refreshTokenRepository
      .delete({
        expiresAt: LessThan(new Date()),
      })
      .catch(() => {});

    return {
      accessToken: this.jwtService.sign(this.toTokenPayload(user, client)),
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private revokeAllForUser(userId: string) {
    return this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async issueLoginCode(user: User, client: AuthClient) {
    const { token } = await this.signRefreshToken(
      user,
      client,
      LOGIN_CODE_EXPIRES_IN,
    );
    return token;
  }

  async login({ client, ...credentials }: LoginDto) {
    const user = await this.verifyUser(credentials);
    this.assertClientAccess(user, client);
    return this.issueTokens(user, client);
  }

  async getProfile(id: string) {
    const user = await this.userRepository
      .createQueryBuilder('u')
      .leftJoin('u.role', 'r')
      .leftJoin('r.permissions', 'p', 'p.status != :deleted')
      .select(COLUMNS)
      .where('u.status != :deleted', { deleted: Status.DELETED })
      .andWhere('u.id = :id', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async thirdPartyLogin(profile: IGoogleProfile, client: AuthClient) {
    const { email, emailVerified, firstName, lastName, picture } = profile;
    if (!email) {
      throw new HttpException(
        'Google account has no email',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!emailVerified) {
      throw new HttpException(
        {
          message: 'Google email not verified',
          code: UserErrorEnum.EMAIL_NOT_VERIFIED,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const user = await this.userRepository.findOne({
      where: { email, status: Status.ACTIVE },
      select: USER_TOKEN_SELECT,
      relations: { role: { permissions: true } },
    });

    let newUser = user;

    if (!newUser && client === AuthClient.BO) {
      throw new ForbiddenException({
        message: 'CMS access denied',
        code: UserErrorEnum.CMS_ACCESS_DENIED,
      });
    }

    if (!newUser) {
      const userRole = await this.roleRepository.findOne({
        where: { code: SystemRoleCode.USER, status: Status.ACTIVE },
        select: { id: true },
      });
      if (!userRole) {
        throw new HttpException(
          'System USER role is missing',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      newUser = await this.usersService.create({
        email,
        firstName: firstName ?? 'New user',
        lastName,
        roleId: userRole.id,
        avatar: picture,
        emailVerified: true,
        provider: Provider.GOOGLE,
      });
    } else if (!newUser.emailVerified) {
      await this.userRepository.update(newUser.id, { emailVerified: true });
      newUser.emailVerified = true;
    }

    this.assertClientAccess(newUser, client);
    return newUser;
  }

  async refresh(refreshToken: string | undefined, client: AuthClient) {
    if (!refreshToken) {
      throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }

    let payload: IRefreshTokenPayload;
    try {
      payload = this.jwtService.verify<IRefreshTokenPayload>(refreshToken, {
        secret: this.jwt.secretRefresh,
      });
    } catch {
      throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }

    if (payload.client !== client) {
      throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }

    const claim = await this.refreshTokenRepository.update(
      {
        id: payload.jti,
        userId: payload.sub,
        client,
        tokenHash: RefreshToken.hash(refreshToken),
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() },
    );

    if (!claim.affected) {
      const existing = await this.refreshTokenRepository.findOne({
        where: { id: payload.jti },
        select: { revokedAt: true },
      });
      if (
        existing?.revokedAt &&
        Date.now() - existing.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS
      ) {
        throw new HttpException(
          {
            message: 'Refresh token already rotated',
            code: UserErrorEnum.REFRESH_TOKEN_ROTATED,
          },
          HttpStatus.UNAUTHORIZED,
        );
      }
      await this.revokeAllForUser(payload.sub);
      throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub, status: Status.ACTIVE },
      select: USER_TOKEN_SELECT,
      relations: { role: { permissions: true } },
    });
    if (!user) {
      throw new HttpException('Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }
    this.assertClientAccess(user, client);

    return this.issueTokens(user, client);
  }

  async logout(
    refreshToken: string | undefined,
    client: AuthClient,
    allDevices = false,
  ) {
    if (!refreshToken) {
      return;
    }

    let payload: IRefreshTokenPayload;
    try {
      payload = this.jwtService.verify<IRefreshTokenPayload>(refreshToken, {
        secret: this.jwt.secretRefresh,
        ignoreExpiration: true,
      });
    } catch {
      return;
    }
    if (payload.client !== client) {
      return;
    }

    if (allDevices) {
      await this.revokeAllForUser(payload.sub);
      return;
    }
    await this.refreshTokenRepository.update(
      {
        id: payload.jti,
        userId: payload.sub,
        tokenHash: RefreshToken.hash(refreshToken),
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() },
    );
  }
}
