import type { Request, Response } from 'express';

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  type GoogleConfig,
  googleConfig,
} from '../../configs/google.config.js';
import { ErrorResponseDto } from '../../shared/dto/index.js';
import { Throttle } from '../../shared/throttle/throttle.decorator.js';
import {
  AuthClient,
  isServerClient,
  type IRequestWithGoogleUser,
  type IRequestWithUser,
} from '../../types/auth.type.js';
import {
  clearOAuthStateCookie,
  clearRefreshTokenCookie,
  OAUTH_STATE_COOKIE,
  refreshCookieName,
  setRefreshTokenCookie,
} from './auth.cookie.js';
import { AuthService, type IssuedTokens } from './auth.service.js';
import { CheckPermissions } from './decorators/check-permissions.decorator.js';
import { Public } from './decorators/public.decorator.js';
import {
  MessageResponseDto,
  ProfileDto,
  TokenResponseDto,
} from './dto/auth-response.dto.js';
import {
  EmailDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto.js';
import { GoogleAuthGuard } from './guards/google.guard.js';
import { nonceMatches, parseOAuthState } from './oauth-state.js';

const AUTH_THROTTLE = { limit: 10, ttl: 60_000 };

const CHECK_EMAIL: MessageResponseDto = {
  message: 'If the email can receive a code, one has been sent',
};

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(googleConfig.KEY) private readonly google: GoogleConfig,
  ) {}

  private respondWithTokens(
    res: Response,
    client: AuthClient,
    tokens: IssuedTokens,
  ) {
    if (isServerClient(client)) {
      return {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        refresh_token_expires_at: tokens.refreshTokenExpiresAt,
      };
    }
    setRefreshTokenCookie(
      res,
      client,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );
    return { access_token: tokens.accessToken };
  }

  private readRefreshToken(
    req: Request,
    client: AuthClient,
    bodyToken?: string,
  ): string | undefined {
    return isServerClient(client)
      ? bodyToken
      : req.cookies?.[refreshCookieName(client)];
  }

  private clearCookie(res: Response, client: AuthClient) {
    if (!isServerClient(client)) {
      clearRefreshTokenCookie(res, client);
    }
  }

  @Post('login')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiCreatedResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async login(
    @Body() signInDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondWithTokens(
      res,
      signInDto.client,
      await this.authService.login(signInDto),
    );
  }

  @Post('register')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Create a student account and email a verification code',
    description:
      'Answers the same whether or not the email is already registered',
  })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async register(@Body() dto: RegisterDto) {
    await this.authService.register(dto);
    return CHECK_EMAIL;
  }

  @Post('verify-email')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Verify the email with its code and log in' })
  @ApiCreatedResponse({ type: TokenResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respondWithTokens(
      res,
      dto.client,
      await this.authService.verifyEmail(dto),
    );
  }

  @Post('verify-email/resend')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Email a new verification code' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async resendVerification(@Body() { email }: EmailDto) {
    await this.authService.resendVerification(email);
    return CHECK_EMAIL;
  }

  @Post('forgot-password')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Email a password reset code' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async forgotPassword(@Body() { email }: EmailDto) {
    await this.authService.forgotPassword(email);
    return CHECK_EMAIL;
  }

  @Post('reset-password')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Set a new password with a reset code and log out every session',
  })
  @ApiCreatedResponse({ description: 'No body' })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
  }

  @Get('google')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @ApiQuery({ name: 'client', enum: AuthClient, enumName: 'AuthClient' })
  @ApiOperation({ summary: 'Redirect to Google OAuth consent screen' })
  @ApiFoundResponse({ description: 'Redirects to Google' })
  async googleAuth() {}

  @Get('google/callback')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Handle Google OAuth callback and issue tokens' })
  @ApiFoundResponse({
    description:
      'Redirects to the client; web gets ?code (and ?state), errors come as ?error',
  })
  async googleAuthCallback(
    @Req() req: IRequestWithGoogleUser,
    @Res() res: Response,
  ) {
    const state = parseOAuthState(req.query.state);
    if (!state) {
      throw new BadRequestException('Invalid state');
    }
    const { client, nonce, clientNonce } = state;
    const expectedNonce: unknown = req.cookies?.[OAUTH_STATE_COOKIE];
    clearOAuthStateCookie(res);

    const redirectUrl = new URL(this.google.loginRedirectUrls[client]);
    try {
      if (!nonceMatches(expectedNonce, nonce)) {
        throw new UnauthorizedException('OAuth state mismatch');
      }
      if (!req.user) {
        throw new UnauthorizedException();
      }
      const user = await this.authService.thirdPartyLogin(req.user, client);
      if (isServerClient(client)) {
        redirectUrl.searchParams.set(
          'code',
          await this.authService.issueLoginCode(user, client),
        );
        if (clientNonce) {
          redirectUrl.searchParams.set('state', clientNonce);
        }
      } else {
        this.respondWithTokens(
          res,
          client,
          await this.authService.issueTokens(user, client),
        );
      }
    } catch (error) {
      this.clearCookie(res, client);
      redirectUrl.searchParams.set(
        'error',
        error instanceof ForbiddenException
          ? 'cms_access_denied'
          : 'google_login_failed',
      );
    }
    res.redirect(redirectUrl.toString());
  }

  @Post('refresh')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Rotate the refresh token cookie and issue a new access token',
  })
  @ApiCreatedResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() { client, refreshToken }: RefreshDto,
  ) {
    try {
      return this.respondWithTokens(
        res,
        client,
        await this.authService.refresh(
          this.readRefreshToken(req, client, refreshToken),
          client,
        ),
      );
    } catch (error) {
      this.clearCookie(res, client);
      throw error;
    }
  }

  @Get('profile')
  @ApiBearerAuth()
  @CheckPermissions()
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiOkResponse({ type: ProfileDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  getProfile(@Req() req: IRequestWithUser) {
    return this.authService.getProfile(req.user.id);
  }

  @Post('logout')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary:
      'Log out the current session, or all devices when allDevices is true',
  })
  @ApiCreatedResponse({ description: 'No body' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: LogoutDto,
  ) {
    try {
      await this.authService.logout(
        this.readRefreshToken(req, dto.client, dto.refreshToken),
        dto.client,
        dto.allDevices,
      );
    } finally {
      this.clearCookie(res, dto.client);
    }
  }
}
