export type Fail = (reason: string) => never;

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function assertOnlyFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  fail: Fail,
) {
  const extra = Object.keys(value).filter((k) => !allowed.includes(k));
  if (extra.length) {
    fail(`unexpected field(s) ${extra.join(', ')}`);
  }
}
