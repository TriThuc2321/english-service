import type { Request } from 'express';

import {
  BadRequestException,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { isAuthClient } from '../../../types/auth.type.js';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor() {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.query.code || req.query.error) {
      return {};
    }
    if (!isAuthClient(req.query.client)) {
      throw new BadRequestException('Invalid client');
    }
    return { state: req.query.client };
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    return (err ? null : user) as TUser;
  }
}
