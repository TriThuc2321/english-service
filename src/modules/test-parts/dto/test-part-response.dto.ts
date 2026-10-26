import { ApiProperty } from '@nestjs/swagger';

import { GroupPassageSummaryDto } from '../../question-groups/dto/question-group-response.dto.js';

export class TestPartDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  sectionId: number;

  @ApiProperty()
  order: number;

  @ApiProperty({ type: String, nullable: true })
  title: string | null;

  @ApiProperty({ type: String, nullable: true })
  instruction: string | null;

  @ApiProperty({ type: Number, nullable: true })
  audioMediaId: number | null;

  @ApiProperty({ type: Number, nullable: true })
  audioStartMs: number | null;

  @ApiProperty({ type: Number, nullable: true })
  audioEndMs: number | null;

  @ApiProperty({ type: Number, nullable: true })
  passageId: number | null;

  @ApiProperty({ type: GroupPassageSummaryDto, nullable: true })
  passage: GroupPassageSummaryDto | null;
}
