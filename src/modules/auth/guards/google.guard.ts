import type { Request, Response } from 'express';

import {
  BadRequestException,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { isAuthClient } from '../../../types/auth.type.js';
import { setOAuthStateCookie } from '../auth.cookie.js';
import {
  generateNonce,
  isValidNonce,
  serializeOAuthState,
} from '../oauth-state.js';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor() {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    if (req.query.code || req.query.error) {
      return {};
    }

    const { client, nonce: clientNonce } = req.query;
    if (!isAuthClient(client)) {
      throw new BadRequestException('Invalid client');
    }
    if (clientNonce !== undefined && !isValidNonce(clientNonce)) {
      throw new BadRequestException('Invalid nonce');
    }

    const nonce = generateNonce();
    setOAuthStateCookie(http.getResponse<Response>(), nonce);
    return { state: serializeOAuthState({ client, nonce, clientNonce }) };
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    return (err ? null : user) as TUser;
  }
}
