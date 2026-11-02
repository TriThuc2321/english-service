import type { ExecutionContext, Type } from '@nestjs/common';

import { Controller, Get, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Throttle } from './throttle.decorator.js';
import { DEFAULT_THROTTLE, ThrottleGuard } from './throttle.guard.js';

@Controller()
class OpenController {
  @Get()
  list() {}

  @Get()
  detail() {}

  @Get()
  @Throttle({ limit: 2, ttl: 10_000 })
  login() {}
}

describe('ThrottleGuard', () => {
  let guard: ThrottleGuard;
  let headers: Record<string, unknown>;

  const context = <T>(controller: Type<T>, handler: keyof T, ip = '1.1.1.1') =>
    ({
      getClass: () => controller,
      getHandler: () => controller.prototype[handler],
      switchToHttp: () => ({
        getRequest: () => ({ ip }),
        getResponse: () => ({
          setHeader: (name: string, value: unknown) => {
            headers[name] = value;
          },
        }),
      }),
    }) as unknown as ExecutionContext;

  const hit = (ctx: ExecutionContext, times: number) => {
    for (let i = 0; i < times; i++) guard.canActivate(ctx);
  };

  const tooManyRequests = expect.objectContaining({
    status: HttpStatus.TOO_MANY_REQUESTS,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    guard = new ThrottleGuard(new Reflector());
    headers = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies the default limit to undecorated handlers', () => {
    const ctx = context(OpenController, 'list');
    hit(ctx, DEFAULT_THROTTLE.limit);

    expect(headers['X-RateLimit-Remaining']).toBe(0);
    expect(() => guard.canActivate(ctx)).toThrow(tooManyRequests);
    expect(headers['Retry-After']).toBe(DEFAULT_THROTTLE.ttl / 1000);
  });

  it('applies the @Throttle() limit of the handler', () => {
    const ctx = context(OpenController, 'login');
    hit(ctx, 2);

    expect(() => guard.canActivate(ctx)).toThrow(tooManyRequests);
  });

  it('counts each handler and each client IP separately', () => {
    hit(context(OpenController, 'login'), 2);

    expect(guard.canActivate(context(OpenController, 'detail'))).toBe(true);
    expect(guard.canActivate(context(OpenController, 'login', '2.2.2.2'))).toBe(
      true,
    );
  });

  it('opens a new window once the ttl has passed', () => {
    const ctx = context(OpenController, 'login');
    hit(ctx, 2);
    expect(() => guard.canActivate(ctx)).toThrow(tooManyRequests);

    vi.advanceTimersByTime(10_000);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(headers['X-RateLimit-Remaining']).toBe(1);
  });
});
