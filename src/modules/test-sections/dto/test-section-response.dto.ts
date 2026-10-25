import { ApiProperty } from '@nestjs/swagger';

import { SkillType } from '../../../types/test.type.js';

export class TestSectionDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  testId: number;

  @ApiProperty({ enum: SkillType, enumName: 'SkillType' })
  skill: SkillType;

  @ApiProperty()
  order: number;

  @ApiProperty({ type: Number, nullable: true })
  durationMinutes: number | null;
}
