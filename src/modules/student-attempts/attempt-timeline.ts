import { AttemptMode, AttemptSectionStatus } from '../../types/attempt.type.js';
import { ExamType } from '../../types/test.type.js';

export const GRACE_MS = 30_000;

export interface ITimelineSection {
  sectionId: number;
  order: number;
  durationMinutes: number | null;
  status: AttemptSectionStatus;
  startedAt: Date | null;
  deadlineAt: Date | null;
  submittedAt: Date | null;
}

export interface ITimeline {
  deadlineAt: Date | null;
  sections: ITimelineSection[];
}

const isSequential = (examType: ExamType): boolean =>
  examType === ExamType.IELTS_ACADEMIC || examType === ExamType.IELTS_GENERAL;

const addMinutes = (from: Date, minutes: number): Date =>
  new Date(from.getTime() + minutes * 60_000);

const isOpen = (s: ITimelineSection): boolean =>
  s.status === AttemptSectionStatus.IN_PROGRESS;

const start = (s: ITimelineSection, at: Date): ITimelineSection => ({
  ...s,
  status: AttemptSectionStatus.IN_PROGRESS,
  startedAt: at,
  deadlineAt:
    s.durationMinutes === null ? null : addMinutes(at, s.durationMinutes),
});

const finish = (
  s: ITimelineSection,
  status: AttemptSectionStatus,
  at: Date,
): ITimelineSection => ({ ...s, status, submittedAt: at });

const openNext = (
  sections: ITimelineSection[],
  at: Date,
): ITimelineSection[] => {
  const next = sections.find(
    (s) => s.status === AttemptSectionStatus.NOT_STARTED,
  );
  return sections.map((s) => (s === next ? start(s, at) : s));
};

export function openTimeline(
  input: {
    examType: ExamType;
    mode: AttemptMode;
    testDurationMinutes: number | null;
    sections: Pick<
      ITimelineSection,
      'sectionId' | 'order' | 'durationMinutes'
    >[];
  },
  now: Date,
): ITimeline {
  const sections: ITimelineSection[] = [...input.sections]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      ...s,
      status: AttemptSectionStatus.NOT_STARTED,
      startedAt: null,
      deadlineAt: null,
      submittedAt: null,
    }));

  if (isSequential(input.examType)) {
    return { deadlineAt: null, sections: openNext(sections, now) };
  }

  let minutes: number | null;
  if (input.mode === AttemptMode.FULL) {
    minutes = input.testDurationMinutes;
  } else if (sections.some((s) => s.durationMinutes === null)) {
    minutes = null;
  } else {
    minutes = sections.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  }

  return {
    deadlineAt: minutes === null ? null : addMinutes(now, minutes),
    sections: sections.map((s) => ({
      ...start(s, now),
      deadlineAt: null,
    })),
  };
}

export function reconcile(
  examType: ExamType,
  timeline: ITimeline,
  now: Date,
): { timeline: ITimeline; expired: boolean } {
  if (!timeline.sections.some(isOpen)) return { timeline, expired: false };

  if (!isSequential(examType)) {
    const { deadlineAt } = timeline;
    if (!deadlineAt || now.getTime() <= deadlineAt.getTime() + GRACE_MS) {
      return { timeline, expired: false };
    }
    return {
      timeline: {
        ...timeline,
        sections: timeline.sections.map((s) =>
          isOpen(s) ? finish(s, AttemptSectionStatus.EXPIRED, deadlineAt) : s,
        ),
      },
      expired: true,
    };
  }

  let sections = timeline.sections;
  let changed = false;
  for (;;) {
    const open = sections.find(isOpen);
    if (
      !open?.deadlineAt ||
      now.getTime() <= open.deadlineAt.getTime() + GRACE_MS
    ) {
      break;
    }
    const at = open.deadlineAt;
    sections = openNext(
      sections.map((s) =>
        s === open ? finish(s, AttemptSectionStatus.EXPIRED, at) : s,
      ),
      at,
    );
    changed = true;
  }

  if (!changed) return { timeline, expired: false };
  const next = { ...timeline, sections };
  return { timeline: next, expired: isFinished(next) };
}

export function submitSection(
  examType: ExamType,
  timeline: ITimeline,
  sectionId: number,
  now: Date,
): ITimeline {
  const sections = timeline.sections.map((s) =>
    s.sectionId === sectionId && isOpen(s)
      ? finish(s, AttemptSectionStatus.SUBMITTED, now)
      : s,
  );
  return {
    ...timeline,
    sections: isSequential(examType) ? openNext(sections, now) : sections,
  };
}

export function closeAll(timeline: ITimeline, now: Date): ITimeline {
  return {
    ...timeline,
    sections: timeline.sections.map((s) =>
      isOpen(s) || s.status === AttemptSectionStatus.NOT_STARTED
        ? finish(s, AttemptSectionStatus.SUBMITTED, now)
        : s,
    ),
  };
}

export const isFinished = (timeline: ITimeline): boolean =>
  !timeline.sections.some(
    (s) =>
      s.status === AttemptSectionStatus.IN_PROGRESS ||
      s.status === AttemptSectionStatus.NOT_STARTED,
  );
