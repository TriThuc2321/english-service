import { ApiProperty } from '@nestjs/swagger';

export class DeleteResultDto {
  @ApiProperty({ description: 'Number of rows actually deleted' })
  deleted: number;
}
