import { SetMetadata } from '@nestjs/common';

export interface ThrottleOptions {
  limit: number;
  ttl: number;
}

export const THROTTLE_KEY = 'throttle';
export const Throttle = (options: ThrottleOptions) =>
  SetMetadata(THROTTLE_KEY, options);
