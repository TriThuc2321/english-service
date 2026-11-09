import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash, hashSync } from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';

import { type JWTConfig, jwtConfig } from '../../configs/jwt.config.js';
import { AuthSession } from '../../entities/auth-session.entity.js';
import { Role } from '../../entities/role.entity.js';
import { User } from '../../entities/user.entity.js';
import { MailService } from '../../shared/mail/mail.service.js';
import {
  alreadyRegisteredTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from '../../shared/mail/mail.templates.js';
import {
  AuthClient,
  EmailCodePurpose,
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
import { BCRYPT_ROUNDS, UsersService } from '../users/users.service.js';
import {
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto.js';
import { EmailCodeService } from './email-code.service.js';

const LOGIN_CODE_EXPIRES_IN = '60s';
const REFRESH_REUSE_GRACE_MS = 30_000;
// Revoked sessions are no longer needed for replay detection; keep briefly for debugging.
const REVOKED_SESSION_RETENTION = '1 day';

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
    @InjectRepository(AuthSession)
    private authSessionRepository: Repository<AuthSession>,
    @Inject(jwtConfig.KEY) private readonly jwt: JWTConfig,
    private readonly emailCodeService: EmailCodeService,
    private readonly mailService: MailService,
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

  private signRefreshToken(
    userId: string,
    sid: string,
    client: AuthClient,
    expiresIn: JWTConfig['refreshExpiresIn'],
  ) {
    const jti = randomUUID();
    const token = this.jwtService.sign(
      { sub: userId, sid, jti, client } satisfies IRefreshTokenPayload,
      { secret: this.jwt.secretRefresh, expiresIn },
    );
    const { exp } = this.jwtService.decode<{ exp: number }>(token);
    return { jti, token, expiresAt: new Date(exp * 1000) };
  }

  private async createSession(
    user: User,
    client: AuthClient,
    expiresIn: JWTConfig['refreshExpiresIn'],
  ) {
    const sid = randomUUID();
    const { jti, token, expiresAt } = this.signRefreshToken(
      user.id,
      sid,
      client,
      expiresIn,
    );

    await this.authSessionRepository.insert({
      id: sid,
      userId: user.id,
      client,
      currentJti: jti,
      tokenHash: AuthSession.hash(token),
      expiresAt,
    });

    this.authSessionRepository
      .createQueryBuilder()
      .delete()
      .where('expires_at < NOW()')
      .orWhere(`revoked_at < NOW() - INTERVAL '${REVOKED_SESSION_RETENTION}'`)
      .execute()
      .catch(() => {});

    return { token, expiresAt };
  }

  private toIssuedTokens(
    user: User,
    client: AuthClient,
    refresh: { token: string; expiresAt: Date },
  ): IssuedTokens {
    return {
      accessToken: this.jwtService.sign(this.toTokenPayload(user, client)),
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
    };
  }

  async issueTokens(user: User, client: AuthClient): Promise<IssuedTokens> {
    const refresh = await this.createSession(
      user,
      client,
      this.jwt.refreshExpiresIn,
    );
    return this.toIssuedTokens(user, client, refresh);
  }

  private revokeAllForUser(userId: string) {
    return this.authSessionRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async issueLoginCode(user: User, client: AuthClient) {
    const { token } = await this.createSession(
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

  private async getDefaultRoleId() {
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
    return userRole.id;
  }

  private findActiveByEmail(email: string) {
    return this.userRepository.findOne({
      where: { email, status: Status.ACTIVE },
      select: { id: true, email: true, emailVerified: true, provider: true },
    });
  }

  private async sendCode(
    userId: string,
    email: string,
    purpose: EmailCodePurpose,
  ) {
    const code = await this.emailCodeService.issue(userId, purpose);
    if (!code) {
      return;
    }
    const template =
      purpose === EmailCodePurpose.VERIFY_EMAIL
        ? verifyEmailTemplate(code)
        : resetPasswordTemplate(code);
    // Not awaited so the response time doesn't reveal whether a mail went out.
    void this.mailService.send({ to: email, ...template });
  }

  private async consumeCode(
    email: string,
    purpose: EmailCodePurpose,
    code: string,
  ) {
    const user = await this.findActiveByEmail(email);
    const valid = await this.emailCodeService.consume(user?.id, purpose, code);
    if (!user || !valid) {
      throw new BadRequestException({
        message: 'Invalid or expired code',
        code: UserErrorEnum.INVALID_CODE,
      });
    }
    return user;
  }

  async register({ email, password, firstName, lastName }: RegisterDto) {
    // Hashed before branching so a taken email isn't answered faster.
    const [existing, passwordHash] = await Promise.all([
      this.findActiveByEmail(email),
      hash(password, BCRYPT_ROUNDS),
    ]);

    if (existing?.emailVerified || existing?.provider === Provider.GOOGLE) {
      void this.mailService.send({ to: email, ...alreadyRegisteredTemplate() });
      return;
    }

    let userId = existing?.id;
    // An unverified account can't log in yet, so the latest sign-up wins;
    // only whoever can read the code ever gets to use it.
    if (userId) {
      await this.userRepository.update(userId, {
        password: passwordHash,
        firstName,
        lastName: lastName ?? null,
        auditMetadata: { updatedAt: new Date() },
      });
    } else {
      const created = await this.userRepository.save({
        email,
        password: passwordHash,
        firstName,
        lastName: lastName ?? null,
        roleId: await this.getDefaultRoleId(),
        provider: Provider.LOCAL,
        emailVerified: false,
      });
      userId = created.id;
    }

    await this.sendCode(userId, email, EmailCodePurpose.VERIFY_EMAIL);
  }

  async resendVerification(email: string) {
    const user = await this.findActiveByEmail(email);
    if (user && !user.emailVerified) {
      await this.sendCode(user.id, email, EmailCodePurpose.VERIFY_EMAIL);
    }
  }

  async verifyEmail({ email, code, client }: VerifyEmailDto) {
    const { id } = await this.consumeCode(
      email,
      EmailCodePurpose.VERIFY_EMAIL,
      code,
    );
    await this.userRepository.update(id, { emailVerified: true });

    const user = await this.userRepository.findOneOrFail({
      where: { id },
      select: USER_TOKEN_SELECT,
      relations: { role: { permissions: true } },
    });
    this.assertClientAccess(user, client);
    return this.issueTokens(user, client);
  }

  async forgotPassword(email: string) {
    const user = await this.findActiveByEmail(email);
    if (user) {
      await this.sendCode(user.id, email, EmailCodePurpose.RESET_PASSWORD);
    }
  }

  async resetPassword({ email, code, newPassword }: ResetPasswordDto) {
    const { id } = await this.consumeCode(
      email,
      EmailCodePurpose.RESET_PASSWORD,
      code,
    );
    await this.userRepository.update(id, {
      password: await hash(newPassword, BCRYPT_ROUNDS),
      emailVerified: true,
      auditMetadata: { updatedAt: new Date(), updatedById: id },
    });
    await this.revokeAllForUser(id);
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
      newUser = await this.usersService.create({
        email,
        firstName: firstName ?? 'New user',
        lastName,
        roleId: await this.getDefaultRoleId(),
        avatar: picture,
        emailVerified: true,
        provider: Provider.GOOGLE,
      });
    } else if (!newUser.emailVerified) {
      // The password was set before anyone proved owning this email (e.g. a
      // squatted sign-up), so it must not survive Google proving ownership.
      await this.userRepository.update(newUser.id, {
        emailVerified: true,
        password: null,
      });
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

    if (payload.client !== client || !payload.sid) {
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

    const next = this.signRefreshToken(
      user.id,
      payload.sid,
      client,
      this.jwt.refreshExpiresIn,
    );
    const claim = await this.authSessionRepository.update(
      {
        id: payload.sid,
        userId: payload.sub,
        client,
        currentJti: payload.jti,
        tokenHash: AuthSession.hash(refreshToken),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      {
        currentJti: next.jti,
        tokenHash: AuthSession.hash(next.token),
        previousJti: payload.jti,
        rotatedAt: new Date(),
        expiresAt: next.expiresAt,
      },
    );

    if (!claim.affected) {
      const session = await this.authSessionRepository.findOne({
        where: { id: payload.sid, userId: payload.sub },
        select: {
          id: true,
          previousJti: true,
          rotatedAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) {
        throw new HttpException(
          'Invalid refresh token',
          HttpStatus.UNAUTHORIZED,
        );
      }
      if (
        session.previousJti === payload.jti &&
        session.rotatedAt &&
        Date.now() - session.rotatedAt.getTime() < REFRESH_REUSE_GRACE_MS
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

    return this.toIssuedTokens(user, client, next);
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
    if (payload.client !== client || !payload.sid) {
      return;
    }

    if (allDevices) {
      await this.revokeAllForUser(payload.sub);
      return;
    }
    await this.authSessionRepository.update(
      { id: payload.sid, userId: payload.sub, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
