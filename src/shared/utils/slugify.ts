export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Leaves room in the 255-char column for a "-<n>" deduplication suffix
export const SLUG_MAX_LENGTH = 200;

export function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
}
