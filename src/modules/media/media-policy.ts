import type { MediaKind, MediaScope } from '../../types/media.type.js';

export interface IMediaOwnerPolicy {
  readonly scope: MediaScope;
  readonly prefix: string;
  readonly maxBytes: Partial<Record<MediaKind, number>>;
  assertOwnerWritable(ownerId: string): Promise<void>;
}
