export enum AttemptMode {
  FULL = 'FULL',
  SECTION = 'SECTION',
}

export enum AttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  GRADED = 'GRADED',
  EXPIRED = 'EXPIRED',
}

export enum AttemptSectionStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  EXPIRED = 'EXPIRED',
}

export const AttemptErrorCode = {
  TEST_NOT_FOUND: 'TEST_NOT_FOUND',
  ATTEMPT_NOT_FOUND: 'ATTEMPT_NOT_FOUND',
  ATTEMPT_IN_PROGRESS: 'ATTEMPT_IN_PROGRESS',
  SECTION_NOT_OPEN: 'SECTION_NOT_OPEN',
  ATTEMPT_CLOSED: 'ATTEMPT_CLOSED',
  ATTEMPT_NOT_GRADED: 'ATTEMPT_NOT_GRADED',
} as const;
export type AttemptErrorCode =
  (typeof AttemptErrorCode)[keyof typeof AttemptErrorCode];
