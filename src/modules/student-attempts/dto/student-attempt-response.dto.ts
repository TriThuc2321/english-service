import { ApiProperty, OmitType } from '@nestjs/swagger';

import { ErrorResponseDto } from '../../../shared/dto/index.js';
import {
  AttemptMode,
  AttemptSectionStatus,
  AttemptStatus,
} from '../../../types/attempt.type.js';
import { ExamType, SkillType } from '../../../types/test.type.js';

export class AttemptSectionDto {
  @ApiProperty({ description: 'attempt_sections id' })
  id: string;

  @ApiProperty({ description: 'test_sections id' })
  sectionId: number;

  @ApiProperty({ enum: SkillType, enumName: 'SkillType' })
  skill: SkillType;

  @ApiProperty()
  order: number;

  @ApiProperty({
    enum: AttemptSectionStatus,
    enumName: 'AttemptSectionStatus',
  })
  status: AttemptSectionStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deadlineAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt: string | null;

  @ApiProperty({ type: Number, nullable: true })
  rawScore: number | null;

  @ApiProperty({ type: Number, nullable: true })
  maxScore: number | null;

  @ApiProperty({ type: Number, nullable: true })
  scaledScore: number | null;
}

export class AttemptAnswerStateDto {
  @ApiProperty()
  questionId: number;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  response: Record<string, unknown> | null;

  @ApiProperty()
  flagged: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  answeredAt: string | null;
}

export class AttemptDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  testId: number;

  @ApiProperty()
  testSlug: string;

  @ApiProperty({ enum: AttemptMode, enumName: 'AttemptMode' })
  mode: AttemptMode;

  @ApiProperty({ enum: AttemptStatus, enumName: 'AttemptStatus' })
  status: AttemptStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deadlineAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt: string | null;

  @ApiProperty({ type: Number, nullable: true })
  overallScore: number | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Remaining time is deadlineAt - serverNow',
  })
  serverNow: string;

  @ApiProperty({ type: [AttemptSectionDto] })
  sections: AttemptSectionDto[];

  @ApiProperty({ type: [AttemptAnswerStateDto] })
  answers: AttemptAnswerStateDto[];
}

export class AttemptTestDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: ExamType, enumName: 'ExamType' })
  examType: ExamType;
}

export class AttemptListItemDto extends OmitType(AttemptDto, [
  'answers',
  'serverNow',
] as const) {
  @ApiProperty({ type: AttemptTestDto })
  test: AttemptTestDto;
}

export class SaveAnswersResultDto {
  @ApiProperty({ type: String, format: 'date-time' })
  savedAt: string;

  @ApiProperty({ type: String, format: 'date-time' })
  serverNow: string;
}

export class AttemptInProgressErrorDto extends ErrorResponseDto {
  @ApiProperty({
    required: false,
    description: 'The attempt already in progress',
  })
  attemptId?: string;
}

export class AttemptEvidenceDto {
  @ApiProperty({ required: false })
  paragraphId?: number;

  @ApiProperty({ required: false })
  quote?: string;
}

export class AttemptResultQuestionDto {
  @ApiProperty()
  questionId: number;

  @ApiProperty({ description: 'test_sections id' })
  sectionId: number;

  @ApiProperty()
  numberFrom: number;

  @ApiProperty()
  numberTo: number;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  response: Record<string, unknown> | null;

  @ApiProperty({ type: Boolean, nullable: true })
  isCorrect: boolean | null;

  @ApiProperty()
  score: number;

  @ApiProperty()
  maxScore: number;

  @ApiProperty()
  flagged: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: '{ key } | { keys } | { accepted }',
  })
  answer: Record<string, unknown>;

  @ApiProperty({ type: String, nullable: true })
  explanation: string | null;

  @ApiProperty({ type: AttemptEvidenceDto, nullable: true })
  evidence: AttemptEvidenceDto | null;
}

export class AttemptTranscriptDto {
  @ApiProperty()
  mediaId: number;

  @ApiProperty()
  transcript: string;
}

export class AttemptResultDto {
  @ApiProperty({ type: AttemptListItemDto })
  attempt: AttemptListItemDto;

  @ApiProperty({
    type: [AttemptResultQuestionDto],
    description: 'Sorted by section order, then numberFrom',
  })
  questions: AttemptResultQuestionDto[];

  @ApiProperty({ type: [AttemptTranscriptDto] })
  transcripts: AttemptTranscriptDto[];
}
