import { ApiProperty } from '@nestjs/swagger';

export class ParagraphDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  content: string;

  @ApiProperty()
  order: number;

  @ApiProperty()
  passageId: number;
}
