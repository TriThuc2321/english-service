import type { ValueTransformer } from 'typeorm';

// pg returns numeric as string; scores are small decimals, safe as number
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value == null ? value : Number(value)),
};
