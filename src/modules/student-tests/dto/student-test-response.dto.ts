import { ApiProperty, OmitType } from '@nestjs/swagger';

import { MarkedBy } from '../../../entities/passage.entity.js';
import { MediaKind } from '../../../types/media.type.js';
import { ExamType, QuestionType, SkillType } from '../../../types/test.type.js';

const JSON_OBJECT = { type: 'object', additionalProperties: true } as const;

export class StudentMediaDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: MediaKind, enumName: 'MediaKind' })
  kind: MediaKind;

  @ApiProperty({ type: String, nullable: true })
  mimeType: string | null;

  @ApiProperty({ type: Number, nullable: true })
  durationMs: number | null;

  @ApiProperty()
  url: string;
}

export class StudentParagraphDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  content: string;

  @ApiProperty()
  order: number;
}

export class StudentPassageDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  subtitle: string | null;

  @ApiProperty({ enum: MarkedBy, enumName: 'MarkedBy' })
  markedBy: MarkedBy;

  @ApiProperty({ type: [StudentParagraphDto] })
  paragraphs: StudentParagraphDto[];
}

export class StudentQuestionDto {
  @ApiProperty()
  id: number;

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

  @ApiProperty({ type: Number, nullable: true })
  audioStartMs: number | null;

  @ApiProperty({ type: StudentMediaDto, nullable: true })
  audio: StudentMediaDto | null;

  @ApiProperty({ type: StudentMediaDto, nullable: true })
  image: StudentMediaDto | null;
}

export class StudentQuestionGroupDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  order: number;

  @ApiProperty({ enum: QuestionType, enumName: 'QuestionType' })
  questionType: QuestionType;

  @ApiProperty({ type: String, nullable: true })
  instruction: string | null;

  @ApiProperty({ type: Number, nullable: true })
  wordLimit: number | null;

  @ApiProperty({
    ...JSON_OBJECT,
    nullable: true,
    description: 'Shape depends on questionType',
  })
  content: Record<string, unknown> | null;

  @ApiProperty({ type: StudentMediaDto, nullable: true })
  audio: StudentMediaDto | null;

  @ApiProperty({ type: StudentMediaDto, nullable: true })
  image: StudentMediaDto | null;

  @ApiProperty({
    type: [StudentPassageDto],
    description: "Group's own passages (TOEIC Part 7); empty for most groups",
  })
  passages: StudentPassageDto[];

  @ApiProperty({ type: [StudentQuestionDto] })
  questions: StudentQuestionDto[];
}

export class StudentTestPartDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  order: number;

  @ApiProperty({ type: String, nullable: true })
  title: string | null;

  @ApiProperty({ type: String, nullable: true })
  instruction: string | null;

  @ApiProperty({ type: StudentMediaDto, nullable: true })
  audio: StudentMediaDto | null;

  @ApiProperty({ type: Number, nullable: true })
  audioStartMs: number | null;

  @ApiProperty({ type: Number, nullable: true })
  audioEndMs: number | null;

  @ApiProperty({
    type: StudentPassageDto,
    nullable: true,
    description:
      'IELTS Reading: shared by every group without passages of its own',
  })
  passage: StudentPassageDto | null;

  @ApiProperty({ type: [StudentQuestionGroupDto] })
  questionGroups: StudentQuestionGroupDto[];
}

export class StudentTestSectionDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: SkillType, enumName: 'SkillType' })
  skill: SkillType;

  @ApiProperty()
  order: number;

  @ApiProperty({ type: Number, nullable: true })
  durationMinutes: number | null;
}

export class StudentTestSectionDetailDto extends StudentTestSectionDto {
  @ApiProperty({ type: [StudentTestPartDto] })
  testParts: StudentTestPartDto[];
}

export class StudentTestListItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  slug: string;

  @ApiProperty({ enum: ExamType, enumName: 'ExamType' })
  examType: ExamType;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  source: string | null;

  @ApiProperty({ type: Number, nullable: true })
  durationMinutes: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: string | null;

  @ApiProperty({ type: [StudentTestSectionDto] })
  testSections: StudentTestSectionDto[];
}

export class StudentTestDetailDto extends OmitType(StudentTestListItemDto, [
  'testSections',
] as const) {
  @ApiProperty({ type: [StudentTestSectionDetailDto] })
  testSections: StudentTestSectionDetailDto[];
}
