import type { Request, Response } from 'express';

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { THROTTLE_KEY, type ThrottleOptions } from './throttle.decorator.js';

export const DEFAULT_THROTTLE: ThrottleOptions = { limit: 300, ttl: 60_000 };

const SWEEP_INTERVAL_MS = 60_000;

interface ThrottleWindow {
  hits: number;
  resetAt: number;
}

// Stands in for @nestjs/throttler, which is CommonJS and require()s the
// ESM-only @nestjs/common — Vercel's function loader can't do that and crashes
// on boot. Fixed window per (controller, handler, client IP), in memory.
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly windows = new Map<string, ThrottleWindow>();
  private nextSweepAt = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { limit, ttl } =
      this.reflector.getAllAndOverride<ThrottleOptions | undefined>(
        THROTTLE_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? DEFAULT_THROTTLE;
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const now = Date.now();

    this.sweep(now);

    const key = `${context.getClass().name}:${context.getHandler().name}:${req.ip}`;
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { hits: 0, resetAt: now + ttl };
      this.windows.set(key, window);
    }
    window.hits++;

    const resetSeconds = Math.ceil((window.resetAt - now) / 1000);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(limit - window.hits, 0));
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (window.hits > limit) {
      res.setHeader('Retry-After', resetSeconds);
      throw new HttpException(
        'Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private sweep(now: number) {
    if (now < this.nextSweepAt) return;
    this.nextSweepAt = now + SWEEP_INTERVAL_MS;

    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
