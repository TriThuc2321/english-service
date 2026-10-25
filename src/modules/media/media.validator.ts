import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Media } from '../../entities/media.entity.js';
import { MediaKind, MediaScope } from '../../types/media.type.js';

export interface IMediaRefs {
  audioMediaId?: number | null;
  imageMediaId?: number | null;
}

@Injectable()
export class MediaValidator {
  constructor(
    @InjectRepository(Media) private mediaRepository: Repository<Media>,
  ) {}

  async assertRefs(
    { audioMediaId, imageMediaId }: IMediaRefs,
    scope: MediaScope,
  ) {
    const expected: Array<[number, MediaKind]> = [];
    if (audioMediaId != null) expected.push([audioMediaId, MediaKind.AUDIO]);
    if (imageMediaId != null) expected.push([imageMediaId, MediaKind.IMAGE]);
    if (!expected.length) return;

    const found = await this.mediaRepository.find({
      select: { id: true, kind: true, scope: true },
      where: { id: In(expected.map(([id]) => id)) },
    });
    const byId = new Map(found.map((m) => [m.id, m]));

    for (const [id, kind] of expected) {
      const media = byId.get(id);
      // Library media is shared, so it fits any scope
      if (
        !media ||
        (media.scope !== scope && media.scope !== MediaScope.LIBRARY)
      ) {
        throw new BadRequestException(`Media with ID ${id} not found`);
      }
      if (media.kind !== kind) {
        throw new BadRequestException(
          `Media with ID ${id} is ${media.kind}, expected ${kind}`,
        );
      }
    }
  }
}
