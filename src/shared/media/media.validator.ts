import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Media } from '../../entities/media.entity.js';
import { MediaKind } from '../../types/test.type.js';

export interface IMediaRefs {
  audioMediaId?: number | null;
  imageMediaId?: number | null;
}

@Injectable()
export class MediaValidator {
  constructor(
    @InjectRepository(Media) private mediaRepository: Repository<Media>,
  ) {}

  // Turns FK violations into 400s and catches an image id passed as audio
  async assertKinds({ audioMediaId, imageMediaId }: IMediaRefs) {
    const expected: Array<[number, MediaKind]> = [];
    if (audioMediaId != null) expected.push([audioMediaId, MediaKind.AUDIO]);
    if (imageMediaId != null) expected.push([imageMediaId, MediaKind.IMAGE]);
    if (!expected.length) return;

    const found = await this.mediaRepository.find({
      select: { id: true, kind: true },
      where: { id: In(expected.map(([id]) => id)) },
    });
    const kinds = new Map(found.map((m) => [m.id, m.kind]));

    for (const [id, kind] of expected) {
      const actual = kinds.get(id);
      if (!actual) {
        throw new BadRequestException(`Media with ID ${id} not found`);
      }
      if (actual !== kind) {
        throw new BadRequestException(
          `Media with ID ${id} is ${actual}, expected ${kind}`,
        );
      }
    }
  }
}
