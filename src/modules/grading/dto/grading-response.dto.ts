import { ApiProperty } from '@nestjs/swagger';

export class GradingUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;
}

export class AssessmentEntryDto {
  @ApiProperty({ type: Number, nullable: true })
  partId: number | null;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  criteria: Record<string, number>;

  @ApiProperty()
  band: number;

  @ApiProperty({ type: String, nullable: true })
  feedback: string | null;
}

export class AssessmentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  revision: number;

  @ApiProperty()
  band: number;

  @ApiProperty({ type: [AssessmentEntryDto] })
  entries: AssessmentEntryDto[];

  @ApiProperty({ type: GradingUserDto })
  grader: GradingUserDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}
