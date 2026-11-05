import { ApiProperty } from '@nestjs/swagger';

import { AttemptSectionGradingStatus } from '../../../types/attempt.type.js';
import { ExamType, QuestionType, SkillType } from '../../../types/test.type.js';

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

export class GradingTestDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: ExamType, enumName: 'ExamType' })
  examType: ExamType;
}

export class GradingQueueItemDto {
  @ApiProperty()
  attemptSectionId: string;

  @ApiProperty()
  attemptId: string;

  @ApiProperty({ type: GradingUserDto })
  student: GradingUserDto;

  @ApiProperty({ type: GradingTestDto })
  test: GradingTestDto;

  @ApiProperty({ enum: SkillType, enumName: 'SkillType' })
  skill: SkillType;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt: string | null;

  @ApiProperty({
    enum: AttemptSectionGradingStatus,
    enumName: 'AttemptSectionGradingStatus',
  })
  gradingStatus: AttemptSectionGradingStatus;

  @ApiProperty({ type: Number, nullable: true })
  band: number | null;

  @ApiProperty({ type: GradingUserDto, nullable: true })
  grader: GradingUserDto | null;
}

export class GradingExpectedEntryDto {
  @ApiProperty({ type: Number, nullable: true })
  partId: number | null;

  @ApiProperty({ type: Number, nullable: true, enum: [1, 2] })
  task: 1 | 2 | null;

  @ApiProperty({ type: [String] })
  criteria: string[];
}

export class GradingResponseDto {
  @ApiProperty({ type: String, nullable: true })
  text: string | null;

  @ApiProperty({ type: Number, nullable: true })
  wordCount: number | null;

  @ApiProperty({ type: String, nullable: true })
  audioUrl: string | null;
}

export class GradingQuestionDto {
  @ApiProperty()
  questionId: number;

  @ApiProperty()
  numberFrom: number;

  @ApiProperty({ enum: QuestionType, enumName: 'QuestionType' })
  questionType: QuestionType;

  @ApiProperty({ type: String, nullable: true })
  instruction: string | null;

  @ApiProperty({ type: String, nullable: true })
  prompt: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  content: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  audioUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  sample: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  rubric: Record<string, unknown> | null;

  @ApiProperty({ type: GradingResponseDto, nullable: true })
  response: GradingResponseDto | null;
}

export class GradingPartDto {
  @ApiProperty()
  partId: number;

  @ApiProperty()
  order: number;

  @ApiProperty({ type: String, nullable: true })
  title: string | null;

  @ApiProperty({ type: String, nullable: true })
  instruction: string | null;

  @ApiProperty({ type: [GradingQuestionDto] })
  questions: GradingQuestionDto[];
}

export class GradingSectionDto {
  @ApiProperty()
  attemptSectionId: string;

  @ApiProperty()
  attemptId: string;

  @ApiProperty({ type: GradingUserDto })
  student: GradingUserDto;

  @ApiProperty({ type: GradingTestDto })
  test: GradingTestDto;

  @ApiProperty({ enum: SkillType, enumName: 'SkillType' })
  skill: SkillType;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt: string | null;

  @ApiProperty({
    enum: AttemptSectionGradingStatus,
    enumName: 'AttemptSectionGradingStatus',
  })
  gradingStatus: AttemptSectionGradingStatus;

  @ApiProperty({ description: 'Latest revision; 0 when not graded yet' })
  revision: number;

  @ApiProperty({ type: AssessmentDto, nullable: true })
  assessment: AssessmentDto | null;

  @ApiProperty({ type: [GradingExpectedEntryDto] })
  expectedEntries: GradingExpectedEntryDto[];

  @ApiProperty({ type: [GradingPartDto] })
  parts: GradingPartDto[];
}
