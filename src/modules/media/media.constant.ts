import { MediaKind } from '../../types/media.type.js';

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

export const MB = 1024 * 1024;

// Owner-less (LIBRARY) keys skip the owner segment
export const mediaKeyPrefix = (
  prefix: string,
  ownerId: string | null | undefined,
  kind: MediaKind,
) => `${prefix}/${ownerId ? `${ownerId}/` : ''}${kind.toLowerCase()}/`;

export const MEDIA_KEY_PATTERN = new RegExp(
  `^[a-z0-9-]+/(?:[0-9a-z-]+/)?(${Object.values(MediaKind)
    .map((k) => k.toLowerCase())
    .join('|')})/[0-9a-f-]{36}\\.[a-z0-9]+$`,
);
