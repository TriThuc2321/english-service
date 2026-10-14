import { MediaKind } from '../../types/test.type.js';

export const MEDIA_MIME_EXTENSIONS: Record<
  MediaKind,
  Record<string, string>
> = {
  [MediaKind.AUDIO]: {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/wav': 'wav',
  },
  [MediaKind.IMAGE]: {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
  },
};

export const MEDIA_MIME_TYPES = Object.values(MEDIA_MIME_EXTENSIONS).flatMap(
  (m) => Object.keys(m),
);

export const MEDIA_MAX_BYTES: Record<MediaKind, number> = {
  [MediaKind.AUDIO]: 100 * 1024 * 1024,
  [MediaKind.IMAGE]: 10 * 1024 * 1024,
};

// <kind>/<yyyy>/<mm>/<uuid>.<ext>, as issued by MediaService.createUploadUrl
export const MEDIA_KEY_PATTERN =
  /^(audio|image)\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]+$/;
