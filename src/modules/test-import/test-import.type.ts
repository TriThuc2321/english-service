import type { MarkedBy } from '../../entities/passage.entity.js';
import type {
  ExamType,
  QuestionType,
  SkillType,
} from '../../types/test.type.js';

type Json = Record<string, unknown>;

// Paragraphs are referenced by their 1-based position in the part's passage,
// since the DB ids don't exist until the import runs
export interface IImportEvidence {
  paragraph?: number;
  quote?: string;
}

export interface IImportQuestion {
  numberFrom: number;
  numberTo?: number;
  prompt?: string | null;
  content?: Json | null;
  answer: Json;
  explanation?: string | null;
  evidence?: IImportEvidence | null;
}

export interface IImportGroup {
  questionType: QuestionType;
  instruction?: string | null;
  wordLimit?: number | null;
  content?: Json | null;
  questions: IImportQuestion[];
}

export interface IImportPassage {
  title: string;
  subtitle?: string | null;
  markedBy: MarkedBy;
  paragraphs: string[];
}

export interface IImportPart {
  title?: string | null;
  instruction?: string | null;
  passage?: IImportPassage | null;
  groups: IImportGroup[];
}

export interface IImportSection {
  skill: SkillType;
  durationMinutes?: number | null;
  parts: IImportPart[];
}

export interface ITestImport {
  examType: ExamType;
  title: string;
  slug?: string;
  source?: string;
  durationMinutes?: number;
  sections: IImportSection[];
}

export interface IImportIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}
