export type AttemptResponse =
  | { key: string }
  | { keys: string[] }
  | { text: string };

export interface IGradable {
  answer: Record<string, unknown>;
  numberFrom: number;
  numberTo: number;
  wordLimit?: number | null;
}

export interface IGrade {
  isCorrect: boolean | null;
  score: number;
}

const BLANK: IGrade = { isCorrect: null, score: 0 };
const WRONG: IGrade = { isCorrect: false, score: 0 };

export const maxScoreOf = (q: Pick<IGradable, 'numberFrom' | 'numberTo'>) =>
  q.numberTo - q.numberFrom + 1;

export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[.,;:!?]+|[.,;:!?"']+$/g, '');
}

export function countWords(normalized: string): number {
  return normalized ? normalized.split(' ').length : 0;
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];

export function gradeAnswer(
  q: IGradable,
  response: AttemptResponse | null | undefined,
): IGrade {
  const { answer } = q;
  if ('sample' in answer || !response) return BLANK;

  if ('key' in answer) {
    if (!('key' in response)) return isBlank(response) ? BLANK : WRONG;
    const given = response.key.trim();
    if (!given) return BLANK;
    return given === answer.key ? { isCorrect: true, score: 1 } : WRONG;
  }

  if ('keys' in answer) {
    if (!('keys' in response)) return isBlank(response) ? BLANK : WRONG;
    if (!response.keys.length) return BLANK;
    const expected = new Set(asStrings(answer.keys));
    const given = new Set(response.keys.map((k) => k.trim()));
    const score = [...given].filter((k) => expected.has(k)).length;
    return { isCorrect: score === maxScoreOf(q), score };
  }

  if ('accepted' in answer) {
    if (!('text' in response)) return isBlank(response) ? BLANK : WRONG;
    const given = normalizeText(response.text);
    if (!given) return BLANK;
    if (q.wordLimit && countWords(given) > q.wordLimit) return WRONG;
    const hit = asStrings(answer.accepted).some(
      (a) => normalizeText(a) === given,
    );
    return hit ? { isCorrect: true, score: 1 } : WRONG;
  }

  return BLANK;
}

function isBlank(response: AttemptResponse): boolean {
  if ('key' in response) return !response.key.trim();
  if ('keys' in response) return !response.keys.length;
  return !response.text.trim();
}
