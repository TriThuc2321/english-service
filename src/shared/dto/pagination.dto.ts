import type { PageMetaDto } from './page-meta.dto.js';

export class PaginationDto<T> {
  readonly data: T[];

  readonly meta: PageMetaDto;

  constructor(data: T[], meta: PageMetaDto) {
    this.data = data;
    this.meta = meta;
  }
}
