import { ApiProperty } from '@nestjs/swagger';

import { QuestionType } from '../../../types/test.type.js';
import { QuestionDto } from '../../questions/dto/question-response.dto.js';

export class GroupPassageSummaryDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  subtitle: string | null;
}

export class GroupPassageDto {
  @ApiProperty()
  groupId: number;

  @ApiProperty()
  passageId: number;

  @ApiProperty()
  order: number;

  @ApiProperty({ type: GroupPassageSummaryDto })
  passage: GroupPassageSummaryDto;
}

export class QuestionGroupListItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  partId: number;

  @ApiProperty()
  order: number;

  @ApiProperty({ enum: QuestionType, enumName: 'QuestionType' })
  questionType: QuestionType;

  @ApiProperty({ type: String, nullable: true })
  instruction: string | null;

  @ApiProperty({ type: Number, nullable: true })
  wordLimit: number | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Shape depends on questionType',
  })
  content: Record<string, unknown> | null;

  @ApiProperty({ type: Number, nullable: true })
  audioMediaId: number | null;

  @ApiProperty({ type: Number, nullable: true })
  imageMediaId: number | null;

  @ApiProperty({ type: [GroupPassageDto] })
  groupPassages: GroupPassageDto[];

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Lowest numberFrom of the questions; null when it has none',
  })
  numberFrom: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Highest numberTo of the questions; null when it has none',
  })
  numberTo: number | null;
}

export class QuestionGroupDetailDto extends QuestionGroupListItemDto {
  @ApiProperty({ type: [QuestionDto] })
  questions: QuestionDto[];
}
