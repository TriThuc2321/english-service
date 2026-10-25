import { ApiProperty } from '@nestjs/swagger';

interface IPageMeta {
  page: number;
  take: number;
  totalCount: number;
}
export class PageMetaDto {
  constructor({ page, take, totalCount }: IPageMeta) {
    this.page = page;
    this.take = take;
    this.totalCount = totalCount;
  }

  @ApiProperty()
  page: number;

  @ApiProperty()
  take: number;

  @ApiProperty()
  totalCount: number;
}
