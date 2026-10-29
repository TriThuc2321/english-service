import { AttemptMode, AttemptSectionStatus } from '../../types/attempt.type.js';
import { ExamType } from '../../types/test.type.js';
import {
  closeAll,
  GRACE_MS,
  isFinished,
  openTimeline,
  reconcile,
  submitSection,
} from './attempt-timeline.js';

const now = new Date('2026-10-28T10:00:00Z');
const at = (ms: number, base = now) => new Date(base.getTime() + ms);
const min = (n: number) => n * 60_000;

const toeicFull = () =>
  openTimeline(
    {
      examType: ExamType.TOEIC_LR,
      mode: AttemptMode.FULL,
      testDurationMinutes: 120,
      sections: [
        { sectionId: 1, order: 1, durationMinutes: 45 },
        { sectionId: 2, order: 2, durationMinutes: 75 },
      ],
    },
    now,
  );

const ieltsFull = () =>
  openTimeline(
    {
      examType: ExamType.IELTS_ACADEMIC,
      mode: AttemptMode.FULL,
      testDurationMinutes: null,
      sections: [
        { sectionId: 1, order: 1, durationMinutes: 30 },
        { sectionId: 2, order: 2, durationMinutes: 60 },
      ],
    },
    now,
  );

describe('openTimeline', () => {
  it('opens every TOEIC section under the test deadline in FULL mode', () => {
    const t = toeicFull();
    expect(t.deadlineAt).toEqual(at(min(120)));
    for (const s of t.sections) {
      expect(s.status).toBe(AttemptSectionStatus.IN_PROGRESS);
      expect(s.startedAt).toEqual(now);
      expect(s.deadlineAt).toBeNull();
    }
  });

  it('uses the chosen section duration for a TOEIC SECTION attempt', () => {
    const t = openTimeline(
      {
        examType: ExamType.TOEIC_LR,
        mode: AttemptMode.SECTION,
        testDurationMinutes: 120,
        sections: [{ sectionId: 2, order: 2, durationMinutes: 75 }],
      },
      now,
    );
    expect(t.deadlineAt).toEqual(at(min(75)));
  });

  it('has no TOEIC deadline when a chosen section has no duration', () => {
    const t = openTimeline(
      {
        examType: ExamType.TOEIC_LR,
        mode: AttemptMode.SECTION,
        testDurationMinutes: 120,
        sections: [{ sectionId: 2, order: 2, durationMinutes: null }],
      },
      now,
    );
    expect(t.deadlineAt).toBeNull();
  });

  it('opens only the first IELTS section', () => {
    const t = ieltsFull();
    expect(t.deadlineAt).toBeNull();
    expect(t.sections[0]).toMatchObject({
      status: AttemptSectionStatus.IN_PROGRESS,
      startedAt: now,
      deadlineAt: at(min(30)),
    });
    expect(t.sections[1]).toMatchObject({
      status: AttemptSectionStatus.NOT_STARTED,
      startedAt: null,
      deadlineAt: null,
      submittedAt: null,
    });
  });

  it('sorts sections by order', () => {
    const t = openTimeline(
      {
        examType: ExamType.IELTS_GENERAL,
        mode: AttemptMode.FULL,
        testDurationMinutes: null,
        sections: [
          { sectionId: 2, order: 2, durationMinutes: 60 },
          { sectionId: 1, order: 1, durationMinutes: 30 },
        ],
      },
      now,
    );
    expect(t.sections.map((s) => s.sectionId)).toEqual([1, 2]);
    expect(t.sections[0].status).toBe(AttemptSectionStatus.IN_PROGRESS);
  });

  it('opens an untimed IELTS section without a deadline', () => {
    const t = openTimeline(
      {
        examType: ExamType.IELTS_ACADEMIC,
        mode: AttemptMode.SECTION,
        testDurationMinutes: null,
        sections: [{ sectionId: 1, order: 1, durationMinutes: null }],
      },
      now,
    );
    expect(t.sections[0]).toMatchObject({
      status: AttemptSectionStatus.IN_PROGRESS,
      deadlineAt: null,
    });
    const r = reconcile(ExamType.IELTS_ACADEMIC, t, at(min(10_000)));
    expect(r.expired).toBe(false);
    expect(r.timeline).toEqual(t);
  });
});

describe('reconcile', () => {
  it('keeps a TOEIC timeline inside the grace window', () => {
    const t = toeicFull();
    const r = reconcile(ExamType.TOEIC_LR, t, at(min(120) + 29_000));
    expect(r.expired).toBe(false);
    expect(r.timeline).toEqual(t);
  });

  it('expires every TOEIC section past the grace window', () => {
    const t = toeicFull();
    const r = reconcile(ExamType.TOEIC_LR, t, at(min(120) + 31_000));
    expect(r.expired).toBe(true);
    for (const s of r.timeline.sections) {
      expect(s.status).toBe(AttemptSectionStatus.EXPIRED);
      expect(s.submittedAt).toEqual(t.deadlineAt);
    }
  });

  it.each([
    [ExamType.TOEIC_LR, toeicFull, min(120)],
    [ExamType.IELTS_ACADEMIC, ieltsFull, min(30)],
  ])('treats exactly deadline + grace as still open (%s)', (exam, open, ms) => {
    const t = open();
    expect(reconcile(exam, t, at(ms + GRACE_MS))).toEqual({
      timeline: t,
      expired: false,
    });
    const late = reconcile(exam, t, at(ms + GRACE_MS + 1));
    expect(late.timeline.sections[0].status).toBe(AttemptSectionStatus.EXPIRED);
  });

  it('returns a finished timeline unchanged', () => {
    const t = closeAll(toeicFull(), at(min(5)));
    const r = reconcile(ExamType.TOEIC_LR, t, at(min(500)));
    expect(r.expired).toBe(false);
    expect(r.timeline).toEqual(t);
  });

  it('cascades through IELTS sections', () => {
    const r = reconcile(ExamType.IELTS_ACADEMIC, ieltsFull(), at(min(120)));
    expect(r.expired).toBe(true);
    const [l, rd] = r.timeline.sections;
    expect(l).toMatchObject({
      status: AttemptSectionStatus.EXPIRED,
      submittedAt: at(min(30)),
    });
    expect(rd).toMatchObject({
      status: AttemptSectionStatus.EXPIRED,
      startedAt: at(min(30)),
      deadlineAt: at(min(90)),
      submittedAt: at(min(90)),
    });
  });

  it('opens the next IELTS section after the first expires', () => {
    const r = reconcile(ExamType.IELTS_ACADEMIC, ieltsFull(), at(min(31)));
    expect(r.expired).toBe(false);
    const [l, rd] = r.timeline.sections;
    expect(l.status).toBe(AttemptSectionStatus.EXPIRED);
    expect(rd).toMatchObject({
      status: AttemptSectionStatus.IN_PROGRESS,
      startedAt: at(min(30)),
      deadlineAt: at(min(90)),
    });
  });

  it('does not mutate its input', () => {
    const t = ieltsFull();
    const copy = structuredClone(t);
    reconcile(ExamType.IELTS_ACADEMIC, t, at(min(120)));
    expect(t).toEqual(copy);
  });
});

describe('submitSection', () => {
  it('opens the next IELTS section on submit', () => {
    const t = submitSection(
      ExamType.IELTS_ACADEMIC,
      ieltsFull(),
      1,
      at(min(10)),
    );
    const [l, rd] = t.sections;
    expect(l).toMatchObject({
      status: AttemptSectionStatus.SUBMITTED,
      submittedAt: at(min(10)),
    });
    expect(rd).toMatchObject({
      status: AttemptSectionStatus.IN_PROGRESS,
      startedAt: at(min(10)),
      deadlineAt: at(min(70)),
    });
  });

  it('leaves other TOEIC sections running', () => {
    const t = submitSection(ExamType.TOEIC_LR, toeicFull(), 1, at(min(10)));
    expect(t.sections[0].status).toBe(AttemptSectionStatus.SUBMITTED);
    expect(t.sections[1].status).toBe(AttemptSectionStatus.IN_PROGRESS);
  });
});

describe('closeAll', () => {
  it('submits every open and not-started section', () => {
    const t = closeAll(ieltsFull(), at(min(5)));
    for (const s of t.sections) {
      expect(s.status).toBe(AttemptSectionStatus.SUBMITTED);
      expect(s.submittedAt).toEqual(at(min(5)));
    }
    expect(isFinished(t)).toBe(true);
    expect(isFinished(ieltsFull())).toBe(false);
  });
});

describe('isFinished', () => {
  const withStatuses = (...statuses: AttemptSectionStatus[]) => {
    const t = ieltsFull();
    return {
      ...t,
      sections: t.sections.map((s, i) => ({ ...s, status: statuses[i] })),
    };
  };

  it.each([
    [AttemptSectionStatus.SUBMITTED, AttemptSectionStatus.EXPIRED, true],
    [AttemptSectionStatus.EXPIRED, AttemptSectionStatus.IN_PROGRESS, false],
    [AttemptSectionStatus.SUBMITTED, AttemptSectionStatus.NOT_STARTED, false],
  ])('%s + %s -> %s', (first, second, finished) => {
    expect(isFinished(withStatuses(first, second))).toBe(finished);
  });
});
