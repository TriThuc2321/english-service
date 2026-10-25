import { ApiProperty } from '@nestjs/swagger';

const JSON_OBJECT = { type: 'object', additionalProperties: true } as const;

export class QuestionDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  groupId: number;

  @ApiProperty()
  numberFrom: number;

  @ApiProperty()
  numberTo: number;

  @ApiProperty()
  order: number;

  @ApiProperty({ type: String, nullable: true })
  prompt: string | null;

  @ApiProperty({
    ...JSON_OBJECT,
    nullable: true,
    description: 'Shape depends on the group question type',
  })
  content: Record<string, unknown> | null;

  @ApiProperty({
    ...JSON_OBJECT,
    description: '{"key"} | {"keys"} | {"accepted"} | {"sample","rubric"?}',
  })
  answer: Record<string, unknown>;

  @ApiProperty({ type: String, nullable: true })
  explanation: string | null;

  @ApiProperty({ ...JSON_OBJECT, nullable: true })
  evidence: Record<string, unknown> | null;

  @ApiProperty({ type: Number, nullable: true })
  audioMediaId: number | null;

  @ApiProperty({ type: Number, nullable: true })
  imageMediaId: number | null;

  @ApiProperty({ type: Number, nullable: true })
  audioStartMs: number | null;
}
