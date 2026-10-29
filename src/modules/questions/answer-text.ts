import { QuestionType } from '../../types/test.type.js';

type Content = Record<string, unknown> | null | undefined;

export const FIXED_ANSWER_KEYS: Partial<
  Record<QuestionType, ReadonlySet<string>>
> = {
  [QuestionType.TRUE_FALSE_NOT_GIVEN]: new Set(['TRUE', 'FALSE', 'NOT GIVEN']),
  [QuestionType.YES_NO_NOT_GIVEN]: new Set(['YES', 'NO', 'NOT GIVEN']),
};

export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[.,;:!?"']+|[.,;:!?"']+$/g, '');
}

export function countWords(normalized: string): number {
  return normalized ? normalized.split(' ').length : 0;
}

export function optionKeys(content: Content): ReadonlySet<string> | null {
  const options = content?.options;
  if (!Array.isArray(options)) {
    return null;
  }
  const keys = options
    .map((o: unknown) => (o as { key?: unknown } | null)?.key)
    .filter((k): k is string => typeof k === 'string');
  return new Set(keys);
}

export const answerKeysOf = (
  type: QuestionType,
  groupContent: Content,
  questionContent: Content,
): ReadonlySet<string> | null =>
  FIXED_ANSWER_KEYS[type] ??
  optionKeys(questionContent) ??
  optionKeys(groupContent);
