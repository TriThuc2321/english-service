# Teacher Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students submit IELTS Writing essays and Speaking recordings, and teachers grade them on the backoffice through a shared queue, with every band computed by the server.

**Architecture:** Grading progress moves to `attempt_sections.grading_status`; `attempts.status` keeps describing how the attempt ended. A new BO-only `grading` module appends to an `assessments` table inside the existing `FOR UPDATE` attempt lock. Band maths and latest-revision lookup sit in `src/shared/scoring/`, because both `student-attempts` and `grading` need them and neither may import the other. Speaking audio is a new private `MediaScope.ATTEMPT` served through presigned GETs.

**Tech Stack:** NestJS 12 (ESM, `.js` import suffixes), TypeORM 1 + PostgreSQL 16, class-validator, @nestjs/swagger, Cloudflare R2 via `@aws-sdk/client-s3`, Vitest + supertest + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-11-05-teacher-grading-design.md`

**Delivery:** Two PRs. Tasks 1-9 are PR 1 (Writing) on `feat/teacher-grading`. Tasks 10-14 are PR 2 (Speaking) on `feat/teacher-grading-speaking`, branched from PR 1.

## Global Constraints

- All relative imports end in `.js`; run `pnpm format` rather than ordering imports by hand.
- No redundant comments, only non-obvious WHY.
- Commits use conventional format and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `synchronize` is never on. Schema changes go through a reviewed migration.
- Do not set `enumName` to TypeORM's default `<table>_<column>_enum`.
- Errors are `HttpException({ message, code }, status)`. New codes: `ASSESSMENT_REVISION_CONFLICT` (409), `SECTION_NOT_GRADABLE` (409).
- Another user's attempt is 404 `ATTEMPT_NOT_FOUND`, never 403.
- Grading controller: `@Clients(AuthClient.BO)`, `@ApiBearerAuth()`, `@Controller('grading')`, `@ApiTags('Grading')`; permissions `READ`/`CREATE` on `PermissionSubject.ASSESSMENT`.
- Student code never returns grader identity or earlier revisions.
- Response DTOs: nullable-but-present fields use `@ApiProperty({ nullable: true })`; enums use `enumName`; new enum name `AttemptSectionGradingStatus`.
- Out of scope, must stay refused: TOEIC_SW attempts (they start with a 400 today and must keep doing so), Listening/Reading corrections, notifications, AI grading.
- E2E: at most 10 calls per auth route per file; each spec file boots one app.

## Decisions the spec leaves open

- **TOEIC_SW:** `AttemptTreeService` filters by exam type, not by skill alone, so removing the L/R filter cannot open TOEIC_SW.
- **Malformed sections:** an IELTS Writing section built by hand in the CMS skips the import validator. Starting one that doesn't have exactly one Task 1 and one Task 2, in different parts, is a 400; otherwise it would stay `PENDING` forever, since the teacher could not produce a valid entry set. Speaking has the matching check in Task 11.
- **Speaking autosave:** `PUT /answers` refuses Speaking questions even with `response: null`, because a null would erase `{ mediaId }`. Flagging a Speaking question is therefore unsupported.
- **Import prompts:** the five new types join `PROMPTED_TYPES`. A task with no prompt is unusable.
- **Audio confirm:** `MediaService.create` runs outside the attempt transaction, since it makes an R2 call and takes a second pool connection. The section check runs before it and again when writing the answer. A failure at that second check deletes the new media.
- **Abandoned attempts:** expiry is lazy, so a student who never returns would keep `IN_PROGRESS` and their work would never reach the queue. `GET /grading/queue` first closes up to 50 overdue attempts, oldest first. The cutoff uses `GRACE_MS`; `reconcile` still decides each attempt, so Speaking keeps its longer grace. A failure on one attempt is logged and doesn't block the queue.
- **`docs/student-tests-api.md`** is also updated, because its `/result` section becomes false.

## Review Focus

1. A student toggles a flag on a recorded Speaking question and the client sends `response: null`: the recording must survive (Task 11).
2. A test is unpublished or soft-deleted after submission: its sections stay in the queue and can still be graded (Task 8).
3. An essay of only spaces and newlines: it counts as blank, scores 0 and never reaches the queue (Task 5).
4. A recording is deleted from the media library: `/result` and the grading screen still return 200, with `audioUrl: null` (Task 13).
5. A Writing section built in the CMS with only Task 2: starting it is a 400, rather than an attempt nobody can ever grade (Task 4).

---

# PR 1: Writing end-to-end

## Task 1: Schema

**Files:**

- Modify: `src/types/test.type.ts`, `src/types/attempt.type.ts`, `src/types/auth.type.ts`
- Modify: `src/modules/questions/question-answer.ts`, `src/modules/questions/question-content.ts`
- Create: `src/entities/assessment.entity.ts`
- Modify: `src/entities/attempt-section.entity.ts`, `src/entities/attempt.entity.ts`
- Create: `src/migrations/<timestamp>-AddTeacherGrading.ts`
- Test: `test/migrations.e2e-spec.ts`, `src/modules/questions/question-answer.spec.ts`

**Interfaces:**

- Produces:
  - `QuestionType.IELTS_WRITING_TASK_1 | IELTS_WRITING_TASK_2 | IELTS_SPEAKING_PART_1 | IELTS_SPEAKING_PART_2 | IELTS_SPEAKING_PART_3`
  - `PermissionSubject.ASSESSMENT = 'assessment'`. `PermissionsService.onModuleInit` seeds its rows at boot, so the migration needs no insert.
  - `enum AttemptSectionGradingStatus { AUTO_GRADED, PENDING, GRADED }`
  - `AttemptErrorCode.ASSESSMENT_REVISION_CONFLICT`, `AttemptErrorCode.SECTION_NOT_GRADABLE`
  - `interface IAssessmentEntry { partId: number | null; criteria: Record<string, number>; band: number; feedback: string | null }`, `interface IAssessmentDetails { entries: IAssessmentEntry[] }` in `attempt.type.ts`
  - `AttemptSection.gradingStatus?: AttemptSectionGradingStatus | null`
  - `Assessment` entity: `id`, `attemptSectionId`, `revision`, `graderId`, `band` (numeric(3,1), `numericTransformer`), `details: IAssessmentDetails`, `createdAt` (timestamptz), relations `attemptSection` (`onDelete: 'CASCADE'`) and `grader`

- [ ] **Step 1: Write the failing tests**

In `test/migrations.e2e-spec.ts`, add this test before `revert cleanly`, which undoes everything:

```ts
it('backfills finished attempts and leaves open ones null', async () => {
  // seed one GRADED and one IN_PROGRESS attempt, each with one section, gradingStatus null
  const runner = dataSource.createQueryRunner();
  while (await runner.hasColumn('attempt_sections', 'grading_status')) {
    await dataSource.undoLastMigration();
  }
  await dataSource.runMigrations();
  await runner.release();

  expect(statusOf(finishedSection)).toBe('AUTO_GRADED');
  expect(statusOf(openSection)).toBeNull();
});
```

In `question-answer.spec.ts`, add the five new types to the table at line 32 with `single({ sample: 'An essay' })`, and assert `{ key: 'A' }` is rejected for `IELTS_WRITING_TASK_1`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm vitest run src/modules/questions/question-answer.spec.ts`
Expected: FAIL, `IELTS_WRITING_TASK_1` undefined.

- [ ] **Step 3: Add the enums and format rules**

Add the types and codes above. In `QUESTION_ANSWER_KINDS` the five new types use `SAMPLE`. In `GROUP_CONTENT_RULES` they are `null`, in `QUESTION_CONTENT_RULES` they use `timing`.

- [ ] **Step 4: Add the entities**

`AttemptSection.gradingStatus`: column `grading_status`, nullable, `enumName: 'attempt_section_grading_status_enum'`. Add `@Index('idx_attempt_sections_pending', ['submittedAt'], { where: `"grading_status" = 'PENDING'` })`.

`Assessment`: `@Entity('assessments', { schema: 'public' })` with `@Index('uq_assessments_attempt_section_id_revision', ['attemptSectionId', 'revision'], { unique: true })`. It has no `AuditMetadata`: the table in the spec is the whole shape, and rows are never updated.

In `attempt.entity.ts`, rewrite the comment above `@Entity` so `EXPIRED` no longer implies "has its scores", and replace the "(phase 2)" comment on `overallScore`.

- [ ] **Step 5: Generate and edit the migration**

Run: `pnpm migration:generate src/migrations/AddTeacherGrading`, against a local DB migrated to `main`.

Review the SQL. Keep the rename-recreate of `question_type_enum` the generator emits, so `down` removes the values. After the `grading_status` column is added, insert:

```sql
UPDATE "attempt_sections" s SET "grading_status" = 'AUTO_GRADED'
FROM "attempts" a
WHERE a."attempt_id" = s."attempt_id" AND a."status" <> 'IN_PROGRESS'
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/modules/questions/question-answer.spec.ts && pnpm test:e2e test/migrations.e2e-spec.ts`
Expected: PASS, with an empty schema diff and a clean revert.

- [ ] **Step 7: Commit**

```bash
git add -A src test
git commit -m "feat: add grading schema and IELTS Writing/Speaking question types"
```

## Task 2: Import rules for IELTS Writing

**Files:**

- Modify: `src/modules/test-import/test-import.validator.ts`
- Test: `src/modules/test-import/test-import.validator.spec.ts`

**Interfaces:**

- Consumes: the new `QuestionType` values (Task 1)

- [ ] **Step 1: Write the failing tests**

`writing()` builds an `IELTS_ACADEMIC` doc whose WRITING section has part 1 (one `IELTS_WRITING_TASK_1` question, number 1) and part 2 (one `IELTS_WRITING_TASK_2`, number 2), each with a prompt and `{ sample }`.

```ts
it('accepts an IELTS Writing section of Task 1 then Task 2', () => {
  expect(validateTestImport(writing()).filter(isError)).toEqual([]);
});
it.each([
  ['one part', dropPart(1)],
  ['three parts', addPart()],
  ['two Task 2 parts', swapType(0, QuestionType.IELTS_WRITING_TASK_2)],
  ['tasks swapped', swapParts()],
  ['two questions in a task', addQuestion(0)],
])('rejects a Writing section with %s', (_, doc) => {
  expect(messages(doc)).toContainEqual(expect.stringContaining('Writing'));
});
it('requires a prompt on the new types', () => {
  expect(messages(withoutPrompt(writing()))).toContainEqual(
    expect.stringContaining('needs a prompt'),
  );
});
it('does not apply the Writing shape to TOEIC_SW', () => {
  expect(messages(toeicSwWriting())).not.toContainEqual(
    expect.stringContaining('Writing section'),
  );
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm vitest run src/modules/test-import/test-import.validator.spec.ts`
Expected: FAIL on the rejection and prompt cases.

- [ ] **Step 3: Implement `checkWritingSection(section: IImportSection, path: string)`**

Add it as a nested function next to `checkPassage`. Call it from `doc.sections.forEach` only when `section.skill === SkillType.WRITING` and `doc.examType` is `IELTS_ACADEMIC` or `IELTS_GENERAL`. Error text: `an IELTS Writing section needs exactly two parts, Task 1 then Task 2, with one question each`. Add the five types to `PROMPTED_TYPES`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/modules/test-import/test-import.validator.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/test-import
git commit -m "feat: validate IELTS Writing sections on import"
```

## Task 3: Band calculation

**Files:**

- Create: `src/shared/scoring/ielts-band.ts`
- Test: `src/shared/scoring/ielts-band.spec.ts`

**Interfaces:**

- Produces:
  - `roundBand(value: number): number`
  - `criteriaBand(scores: readonly number[]): number`, the mean of the scores, rounded; used for a task and for Speaking
  - `writingBand(task1: number, task2: number): number`
  - `overallScoreOf(input: { examType: ExamType; mode: AttemptMode; scaledBySkill: ReadonlyMap<SkillType, number | null | undefined> }): number | null`

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  [6.25, 6.5],
  [6.75, 7],
  [6.125, 6],
  [6.375, 6.5],
  [6.6, 6.5],
  [9, 9],
  [0, 0],
])('rounds %d to %d', (value, band) => expect(roundBand(value)).toBe(band));

it('averages criteria', () => {
  expect(criteriaBand([7, 6.5, 7, 6])).toBe(6.5);
  expect(criteriaBand([6, 6, 6, 7])).toBe(6.5);
  expect(criteriaBand([6, 7, 7, 7])).toBe(7);
});

it('weights Task 2 double', () => {
  expect(writingBand(7, 6.5)).toBe(6.5);
  expect(writingBand(6, 7)).toBe(6.5);
  expect(writingBand(5, 8)).toBe(7);
});

const skills = (l, r, w, s) =>
  new Map([
    [SkillType.LISTENING, l],
    [SkillType.READING, r],
    [SkillType.WRITING, w],
    [SkillType.SPEAKING, s],
  ]);
const ielts = { examType: ExamType.IELTS_ACADEMIC, mode: AttemptMode.FULL };

it('averages four skills for a FULL IELTS attempt', () => {
  expect(overallScoreOf({ ...ielts, scaledBySkill: skills(7, 6, 6, 6) })).toBe(
    6.5,
  );
  expect(overallScoreOf({ ...ielts, scaledBySkill: skills(7, 7, 7, 6) })).toBe(
    7,
  );
});
it('counts a blank skill as 0', () => {
  expect(overallScoreOf({ ...ielts, scaledBySkill: skills(8, 8, 0, 8) })).toBe(
    6,
  );
});
it('stays null until all four exist', () => {
  expect(
    overallScoreOf({ ...ielts, scaledBySkill: skills(7, 7, 7, null) }),
  ).toBeNull();
});
it('stays null in SECTION mode', () => {
  expect(
    overallScoreOf({
      ...ielts,
      mode: AttemptMode.SECTION,
      scaledBySkill: skills(7, 7, 7, 7),
    }),
  ).toBeNull();
});
it('keeps TOEIC as L + R', () => {
  expect(
    overallScoreOf({
      examType: ExamType.TOEIC_LR,
      mode: AttemptMode.FULL,
      scaledBySkill: new Map([
        [SkillType.LISTENING, 300],
        [SkillType.READING, 250],
      ]),
    }),
  ).toBe(550);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm vitest run src/shared/scoring/ielts-band.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the module**

`roundBand` is `Math.floor(value * 2 + 0.5) / 2`, with a one-line comment that rounding task and section bands this way is this product's choice, not a published IELTS rule. Move the TOEIC rule out of `AttemptScoringService` into `overallScoreOf` (Task 5 calls it).

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/shared/scoring/ielts-band.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/scoring
git commit -m "feat: add IELTS band calculation"
```

## Task 4: Students can answer Writing

**Files:**

- Modify: `src/modules/student-attempts/attempt-grader.ts`, `attempt-response.ts`, `attempt-tree.service.ts`, `student-attempts.service.ts:508-525`, `dto/student-attempts.dto.ts`
- Create: `src/modules/student-attempts/attempt-grading-status.ts` (grows in Task 5)
- Create: `test/utils/grading.ts`, `test/student-writing.e2e-spec.ts`
- Test: `attempt-response.spec.ts`, `attempt-grader.spec.ts`, `attempt-grading-status.spec.ts`

**Interfaces:**

- Consumes: `QuestionType.IELTS_WRITING_TASK_*`
- Produces:
  - `AttemptResponse` keeps `{ key } | { keys } | { text }`
  - `export function isBlankResponse(response: AttemptResponse | null | undefined): boolean` in `attempt-grader.ts` (null counts as blank)
  - `ITreeQuestion.partId: number`
  - `isValidWritingSection(questions: readonly Pick<ITreeQuestion, 'partId' | 'questionType'>[]): boolean` in `attempt-grading-status.ts`
  - `seedExam(testApp: TestApp, skills: SkillType[], overrides?: Partial<Test>): Promise<ISeededExam>` in `test/utils/grading.ts`, where `ISeededExam` is `{ test, sections: Partial<Record<SkillType, TestSection>>, questions: Partial<Record<SkillType, Question[]>> }`. L/R get one question each; Writing gets Task 1 and Task 2 in separate parts; Speaking gets one question per part, three parts. Questions store `{ sample: 'Sample', rubric: { TA: 'Band 7' } }`.
  - `backdateOpenSections(testApp: TestApp, attemptId: string): Promise<void>` in `test/utils/grading.ts`, moved from `test/student-attempts.e2e-spec.ts`

- [ ] **Step 1: Write the failing unit tests**

```ts
describe('IELTS_WRITING_TASK_2', () => {
  const q = question({
    questionType: QuestionType.IELTS_WRITING_TASK_2,
    keys: null,
  });
  it('accepts an essay of 20,000 characters', () => {
    const text = 'a'.repeat(20_000);
    expect(parseResponse(q, { text })).toEqual({ text });
  });
  it('rejects 20,001 characters', () => {
    expect(() => parseResponse(q, { text: 'a'.repeat(20_001) })).toThrow(
      BadRequestException,
    );
  });
  it('ignores the word limit', () => {
    const long = question({ ...q, wordLimit: 2 });
    expect(parseResponse(long, { text: 'one two three' })).toEqual({
      text: 'one two three',
    });
  });
});

it('still refuses TOEIC_SW types', () => {
  expect(() =>
    parseResponse(question({ questionType: QuestionType.OPINION_ESSAY }), {
      text: 'x',
    }),
  ).toThrow('cannot be answered automatically');
});

// attempt-grader.spec.ts
it.each([
  [null, true],
  [{ text: '  \n ' }, true],
  [{ keys: [] }, true],
  [{ text: 'x' }, false],
  [{ key: 'A' }, false],
])('isBlankResponse(%j) is %s', (response, blank) =>
  expect(isBlankResponse(response)).toBe(blank),
);

// attempt-grading-status.spec.ts
const task = (questionType, partId) => ({ questionType, partId });
const T1 = QuestionType.IELTS_WRITING_TASK_1,
  T2 = QuestionType.IELTS_WRITING_TASK_2;
it('accepts Task 1 and Task 2 in separate parts', () =>
  expect(isValidWritingSection([task(T1, 1), task(T2, 2)])).toBe(true));
it.each([
  ['Task 2 only', [task(T2, 2)]],
  ['two Task 2', [task(T2, 1), task(T2, 2)]],
  ['one shared part', [task(T1, 1), task(T2, 1)]],
  [
    'a foreign type',
    [task(T1, 1), task(T2, 2), task(QuestionType.OPINION_ESSAY, 3)],
  ],
])('rejects %s', (_, questions) =>
  expect(isValidWritingSection(questions)).toBe(false),
);
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm vitest run src/modules/student-attempts`
Expected: FAIL.

- [ ] **Step 3: Implement the response shape**

In `attempt-response.ts`, `MAX_ESSAY_LENGTH = 20_000`. `responseField` returns `'text'` for the two Writing types. The text branch picks the limit by question type; the error message keeps the same wording with the value that applied.

In `attempt-grader.ts`, export `isBlankResponse`, built from the private `isBlank`.

- [ ] **Step 4: Implement the tree and start rules**

In `attempt-tree.service.ts`, replace `GRADED_SKILLS` with:

```ts
const IELTS_SKILLS = [
  SkillType.LISTENING,
  SkillType.READING,
  SkillType.WRITING,
];
// TOEIC_SW is out of scope, so its tests keep having no attemptable section
const ATTEMPT_SKILLS: Record<ExamType, readonly SkillType[]> = {
  [ExamType.IELTS_ACADEMIC]: IELTS_SKILLS,
  [ExamType.IELTS_GENERAL]: IELTS_SKILLS,
  [ExamType.TOEIC_LR]: [SkillType.LISTENING, SkillType.READING],
  [ExamType.TOEIC_SW]: [],
};
```

Remove the skill condition from the `s` join, select `t.examType`, and skip other skills in the `test.testSections` loop. Set `partId: p.id` on each question.

In `pickSections`:

- `FULL` picks only `LISTENING`/`READING` sections. PR 2 removes this: a `FULL` IELTS attempt runs in order and could not get past Speaking yet.
- `SECTION` error: `sectionIds must be sections of this test that can be attempted`.
- Empty result: `The test has no section that can be attempted`.
- Any chosen `WRITING` section must pass `isValidWritingSection`, else 400 `Writing section <id> must have one Task 1 and one Task 2 question`.

Update the `SaveAnswerItemDto.response` description.

- [ ] **Step 5: Write the e2e tests**

`test/student-writing.e2e-spec.ts`:

- `saves a 20,000 character essay through autosave`: `PUT` returns 200 and `GET /:id` returns the text. This also covers the 100 kB body limit.
- `keeps FULL on Listening and Reading`: a `FULL` start on an L/R/W test has two sections.
- `refuses to start a TOEIC_SW test`: `POST` is 400. Same for `mode: SECTION` with its section id.
- `refuses a Writing section with only Task 2`: seed L/W, delete the Task 1 question, `POST` with `mode: SECTION` is 400 (Review Focus 5).
- `keeps Speaking closed`: `SECTION` with a Speaking section id is 400.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/modules/student-attempts && pnpm test:e2e test/student-writing.e2e-spec.ts test/student-attempts.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src test
git commit -m "feat: let students answer IELTS Writing"
```

## Task 5: Resolve grading status at finish

**Files:**

- Modify: `src/modules/student-attempts/attempt-grading-status.ts`, `attempt-scoring.service.ts`, `student-attempts.service.ts:341,351,434,473-492`
- Test: `attempt-grading-status.spec.ts`, `test/student-writing.e2e-spec.ts`

**Interfaces:**

- Consumes: `isBlankResponse`, `overallScoreOf`
- Produces:
  - `isTeacherGraded(skill: SkillType): boolean`
  - `resolveTeacherSection(responses: ReadonlyArray<AttemptResponse | null | undefined>): { gradingStatus: AttemptSectionGradingStatus; scaledScore: number | null }`
  - `resolveAttemptStatus(expired: boolean, sections: ReadonlyArray<Pick<AttemptSection, 'gradingStatus'>>): AttemptStatus`
  - `StudentAttemptsService.finish(ctx, expired: boolean, submittedAt: Date)` replaces the `status` parameter

- [ ] **Step 1: Write the failing tests**

```ts
const { AUTO_GRADED, PENDING } = AttemptSectionGradingStatus;

it('sends a section with any response to the teacher', () =>
  expect(resolveTeacherSection([null, { text: 'essay' }])).toEqual({
    gradingStatus: PENDING,
    scaledScore: null,
  }));
it.each([[[]], [[null, undefined]], [[{ text: '   ' }, { text: '\n' }]]])(
  'scores a blank section 0: %j',
  (responses) =>
    expect(resolveTeacherSection(responses)).toEqual({
      gradingStatus: AUTO_GRADED,
      scaledScore: 0,
    }),
);

it('keeps EXPIRED even with work pending', () =>
  expect(resolveAttemptStatus(true, [{ gradingStatus: PENDING }])).toBe(
    AttemptStatus.EXPIRED,
  ));
it('waits for the teacher', () =>
  expect(
    resolveAttemptStatus(false, [
      { gradingStatus: AUTO_GRADED },
      { gradingStatus: PENDING },
    ]),
  ).toBe(AttemptStatus.SUBMITTED));
it('is GRADED when nothing is pending', () =>
  expect(resolveAttemptStatus(false, [{ gradingStatus: AUTO_GRADED }])).toBe(
    AttemptStatus.GRADED,
  ));
```

Add to the e2e file:

- `leaves a Writing section pending`: start, save an essay, submit. The attempt is `SUBMITTED`; the section has `gradingStatus: 'PENDING'` and null `rawScore`, `maxScore`, `scaledScore`; both `attempt_answers` rows have null `is_correct` and `score`.
- `scores a blank Writing section 0`: submit with no answers. The attempt is `GRADED`, the section `AUTO_GRADED` with `scaledScore: 0` and null `rawScore`/`maxScore`.
- `treats a whitespace-only essay as blank`: save `{ text: ' \n\t ' }`, submit, same result (Review Focus 3).
- `keeps an overdue attempt EXPIRED with its section pending`: save, `backdateOpenSections`, `GET /:id`. The attempt is `EXPIRED`, the section `PENDING`.
- `marks Listening and Reading AUTO_GRADED`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm vitest run src/modules/student-attempts/attempt-grading-status.spec.ts`
Expected: FAIL, not exported.

- [ ] **Step 3: Implement the pure functions**

Add them to `attempt-grading-status.ts`.

- [ ] **Step 4: Change `AttemptScoringService.grade`**

Split `attemptSections` by `isTeacherGraded(skill)`.

- Auto sections run today's path and also set `gradingStatus = AUTO_GRADED`.
- Teacher sections upsert their rows with `isCorrect: null, score: null` and keep `response`, `flagged`, `answeredAt`, so `/result` still reports them. Do not call `gradeAnswer` or `lookupScale` for them. Set `gradingStatus` and `scaledScore` from `resolveTeacherSection`, and leave `rawScore`/`maxScore` null.

Replace the overall block with `overallScoreOf({ examType, mode: attempt.mode, scaledBySkill })`.

- [ ] **Step 5: Change `finish`**

After `grade` and the section reload, compute `resolveAttemptStatus(expired, ctx.sections)`. Update the three call sites: `false` for the two submits, `true` for expiry.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/modules/student-attempts && pnpm test:e2e test/student-writing.e2e-spec.ts test/student-attempts.e2e-spec.ts`
Expected: PASS, and L/R attempts still end `GRADED`.

- [ ] **Step 7: Commit**

```bash
git add src test
git commit -m "feat: hold Writing sections for teacher grading at finish"
```

## Task 6: `/result` during grading

**Files:**

- Create: `src/shared/scoring/latest-assessments.ts`
- Modify: `attempt-result.service.ts`, `attempt.mapper.ts`, `dto/student-attempt-response.dto.ts`, `student-attempts.controller.ts:82-86`
- Test: `test/student-writing.e2e-spec.ts`

**Interfaces:**

- Produces:
  - `findLatestAssessments(manager: EntityManager, attemptSectionIds: string[]): Promise<Map<string, Assessment>>`, using `DISTINCT ON (attempt_section_id) ... ORDER BY attempt_section_id, revision DESC`; an empty list returns an empty map without a query
  - `AttemptSectionDto.gradingStatus: AttemptSectionGradingStatus | null`
  - `AttemptResultDto.assessments: AttemptAssessmentDto[]`, where `AttemptAssessmentDto` is `{ attemptSectionId, band, entries: AttemptAssessmentEntryDto[] }`

- [ ] **Step 1: Write the failing e2e tests**

- `returns the review of a pending attempt`: `/result` on `SUBMITTED` is 200 with `assessments: []`, and each Writing question has `answer.sample === 'Sample'`, `isCorrect: null`.
- `still returns 409 while in progress`: `code: 'ATTEMPT_NOT_GRADED'`.
- `shows gradingStatus in history`: `GET /student/attempts` lists `gradingStatus: 'PENDING'`.
- `returns the latest revision only, with no grader`: insert revisions 1 and 2 directly. `assessments` has one item, at revision 2's band, and `JSON.stringify(res.body)` does not contain `grader`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm test:e2e test/student-writing.e2e-spec.ts`
Expected: FAIL, 409 on the pending attempt.

- [ ] **Step 3: Implement**

Change the guard to `attempt.status === AttemptStatus.IN_PROGRESS`. Map `gradingStatus` in `toSectionDto`. Fetch the latest assessments for sections with `gradingStatus === GRADED` and return their `band` and `details.entries`. Update the `ATTEMPT_NOT_GRADED` description to "only while in progress" and the `answer` description to include `{ sample, rubric? }`.

- [ ] **Step 4: Run the tests**

Run: `pnpm test:e2e test/student-writing.e2e-spec.ts test/student-attempts.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat: show grading progress in attempt results"
```

## Task 7: Submit an assessment

**Files:**

- Create: `src/modules/grading/grading-entries.ts`, `grading.service.ts`, `grading.controller.ts`, `grading.module.ts`, `dto/grading.dto.ts`, `dto/grading-response.dto.ts`
- Modify: `src/app.module.ts`
- Create: `test/grading.e2e-spec.ts`
- Test: `src/modules/grading/grading-entries.spec.ts`

**Interfaces:**

- Consumes: `criteriaBand`, `writingBand`, `overallScoreOf`, `Assessment`, `seedExam`
- Produces:
  - `IExpectedEntry { partId: number | null; task: 1 | 2 | null; criteria: readonly string[] }`
  - `expectedEntriesOf(skill: SkillType, questions: ReadonlyArray<{ partId: number; questionType: QuestionType }>): IExpectedEntry[]`
  - `computeAssessment(skill: SkillType, expected: readonly IExpectedEntry[], entries: readonly IEntryInput[]): { band: number; details: IAssessmentDetails }`
  - `IEntryInput { partId: number | null; criteria: Record<string, number>; feedback?: string }`
  - `CreateAssessmentDto { expectedRevision: number; entries: AssessmentEntryInputDto[] }`
  - `AssessmentDto { id, revision, band, entries: AssessmentEntryDto[], grader: GradingUserDto, createdAt }`
  - `GradingUserDto { id, email, firstName, lastName }` (the name fields nullable)
  - `GradingService.createAssessment(id: string, dto: CreateAssessmentDto, graderId: string): Promise<AssessmentDto>`

- [ ] **Step 1: Write the failing unit tests**

```ts
const T1 = QuestionType.IELTS_WRITING_TASK_1,
  T2 = QuestionType.IELTS_WRITING_TASK_2;
const writing = expectedEntriesOf(SkillType.WRITING, [
  { partId: 11, questionType: T1 },
  { partId: 12, questionType: T2 },
]);
const speaking = expectedEntriesOf(SkillType.SPEAKING, [
  { partId: 21, questionType: QuestionType.IELTS_SPEAKING_PART_1 },
  { partId: 22, questionType: QuestionType.IELTS_SPEAKING_PART_2 },
]);
const task1 = { partId: 11, criteria: { TA: 7, CC: 7, LR: 7, GRA: 7 } };
const task2 = { partId: 12, criteria: { TR: 6, CC: 7, LR: 6, GRA: 7 } };

it('derives criteria codes', () => {
  expect(writing).toEqual([
    { partId: 11, task: 1, criteria: ['TA', 'CC', 'LR', 'GRA'] },
    { partId: 12, task: 2, criteria: ['TR', 'CC', 'LR', 'GRA'] },
  ]);
  expect(speaking).toEqual([
    { partId: null, task: null, criteria: ['FC', 'LR', 'GRA', 'P'] },
  ]);
});

it('computes task and section bands for Writing', () => {
  const { band, details } = computeAssessment(SkillType.WRITING, writing, [
    task1,
    task2,
  ]);
  expect(band).toBe(6.5);
  expect(details.entries.map((e) => e.band)).toEqual([7, 6.5]);
  expect(details.entries[0].feedback).toBeNull();
});

it('computes the Speaking band', () => {
  const entry = {
    partId: null,
    criteria: { FC: 7, LR: 6, GRA: 6, P: 7 },
    feedback: 'Good',
  };
  expect(
    computeAssessment(SkillType.SPEAKING, speaking, [entry]),
  ).toMatchObject({
    band: 6.5,
    details: { entries: [{ band: 6.5, feedback: 'Good' }] },
  });
});

it.each([
  ['a missing task', [task1], 'part 12'],
  ['a duplicate task', [task1, task1], 'part 11'],
  ['an unknown part', [task1, { ...task2, partId: 99 }], 'part 99'],
  [
    'a missing criterion',
    [task1, { partId: 12, criteria: { TR: 6, CC: 7, LR: 6 } }],
    'part 12',
  ],
  [
    'Task 1 codes on Task 2',
    [task1, { partId: 12, criteria: task1.criteria }],
    'part 12',
  ],
  [
    'a score above 9',
    [task1, { partId: 12, criteria: { ...task2.criteria, TR: 9.5 } }],
    'part 12',
  ],
  [
    'a score below 0',
    [task1, { partId: 12, criteria: { ...task2.criteria, TR: -0.5 } }],
    'part 12',
  ],
  [
    'a score off the 0.5 step',
    [task1, { partId: 12, criteria: { ...task2.criteria, TR: 6.3 } }],
    'part 12',
  ],
  [
    'a non-number',
    [task1, { partId: 12, criteria: { ...task2.criteria, TR: '6' } }],
    'part 12',
  ],
])('rejects %s and names the entry', (_, entries, name) => {
  expect(() => computeAssessment(SkillType.WRITING, writing, entries)).toThrow(
    BadRequestException,
  );
  expect(() => computeAssessment(SkillType.WRITING, writing, entries)).toThrow(
    name,
  );
});

it('rejects a partId on Speaking', () => {
  const entry = { partId: 21, criteria: { FC: 7, LR: 6, GRA: 6, P: 7 } };
  expect(() =>
    computeAssessment(SkillType.SPEAKING, speaking, [entry]),
  ).toThrow(BadRequestException);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm vitest run src/modules/grading`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `grading-entries.ts`**

Use the signatures above. The criteria validator is `Number.isFinite(v) && v >= 0 && v <= 9 && Number.isInteger(v * 2)`. In messages, refer to Speaking entries as `the Speaking entry`.

- [ ] **Step 4: Write the failing e2e tests**

`test/grading.e2e-spec.ts` seeds a submitted Writing attempt in `beforeEach`. The grader's token holds `READ` and `CREATE ASSESSMENT`, and `grade(sectionId, body, token)` posts with `Task 1 = 7, 7, 7, 7` and `Task 2 = 6, 7, 6, 7`.

- `grades a section and closes the attempt`: 201 with `band: 6.5, revision: 1`. `/result` now shows `gradingStatus: 'GRADED'`, `scaledScore: 6.5`, one assessment, and the attempt is `GRADED`.
- `keeps a SUBMITTED attempt open until the last section is graded`: seed a second Writing section on the same test and start `SECTION` with both. Grade one and expect `SUBMITTED`, grade the other and expect `GRADED`.
- `corrects a grade as a new revision`: a second post with `expectedRevision: 1` and different scores returns `revision: 2`. `scaledScore` follows it, and both rows still exist unchanged.
- `rejects a stale revision`: `expectedRevision: 0` after a grade is 409 `ASSESSMENT_REVISION_CONFLICT`, with no new row.
- `lets one of two concurrent grades through`: `Promise.all` of two posts with `expectedRevision: 0` gives statuses `[201, 409]`.
- `keeps an expired attempt EXPIRED`: grade a section of an `EXPIRED` attempt. The status is unchanged and the section `GRADED`.
- `refuses sections that are not gradable`: an `AUTO_GRADED` section and a section of an `IN_PROGRESS` attempt are both 409 `SECTION_NOT_GRADABLE`.
- `rejects bad entries`: a missing task is 400 and its message names the part.
- `requires CREATE ASSESSMENT`: a `READ`-only token is 403. A `web` token is 403.
- `rejects bad bodies`: `feedback` of 5,001 characters is 400; a negative `expectedRevision` is 400; an unknown section uuid is 404.

- [ ] **Step 5: Implement the service, controller and module**

`createAssessment` runs in `dataSource.transaction(async (m) => ...)`:

1. Load the section with `m.findOne(AttemptSection, { where: { id }, select: { id: true, attemptId: true } })`; 404 if absent.
2. `m.findOneOrFail(Attempt, { where: { id: attemptId }, lock: { mode: 'pessimistic_write' } })`. Keep relations out of this query, because Postgres refuses `FOR UPDATE` across an outer join.
3. Re-read every section of the attempt with `testSection`. Reject with `SECTION_NOT_GRADABLE` unless this one is `PENDING` or `GRADED`.
4. `SELECT MAX(revision)`, defaulting to 0. If it differs from `expectedRevision`, 409 `ASSESSMENT_REVISION_CONFLICT`.
5. Load the section's `partId`/`questionType` pairs, call `expectedEntriesOf` then `computeAssessment`.
6. Insert the assessment at `revision + 1`.
7. Update the section's `scaledScore` and `gradingStatus = GRADED`.
8. Recompute `overallScore` with `overallScoreOf`, taking `examType` from the test and the scaled scores from all sections. Write it to the attempt.
9. If the attempt is `SUBMITTED` and no section is `PENDING`, set `GRADED`.

Use the codes from `AttemptErrorCode`. Add `GradingModule` to `app.module.ts`, with `TypeOrmModule.forFeature([Assessment, Attempt, AttemptSection, TestPart, Test])`. The controller annotations are in Global Constraints; `POST sections/:id/assessments` uses `ParseUUIDPipe`, `@ApiCreatedResponse({ type: AssessmentDto })` and `@CheckPermissions([PermissionAction.CREATE, PermissionSubject.ASSESSMENT])`.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/modules/grading && pnpm test:e2e test/grading.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src test
git commit -m "feat: let teachers submit and correct assessments"
```

## Task 8: Queue, grading screen and revisions

**Files:**

- Create: `src/modules/grading/grading-query.service.ts`
- Create: `src/modules/student-attempts/attempt-expiry.service.ts`
- Modify: `grading.controller.ts`, `grading.module.ts`, `dto/grading.dto.ts`, `dto/grading-response.dto.ts`, `student-attempts.module.ts`
- Test: `test/grading.e2e-spec.ts`, `src/modules/student-attempts/attempt-expiry.service.spec.ts`

**Interfaces:**

- Consumes: `findLatestAssessments`, `expectedEntriesOf`, `MediaService` (imports `MediaModule`), `StudentAttemptsService.expireIfOverdue(userId, id)`
- Produces:
  - `AttemptExpiryService.expireOverdue(now?: Date): Promise<void>`, the only export of `StudentAttemptsModule`; `GradingModule` imports that module, never the reverse
  - `ListGradingQueueDto extends PageOptionsDto { gradingStatus: PENDING | GRADED = PENDING; skill?: WRITING | SPEAKING; testId?: number; search?: string }`
  - `GradingQueueItemDto { attemptSectionId, attemptId, student: GradingUserDto, test: { id, title, examType }, skill, submittedAt, gradingStatus, band: number | null, grader: GradingUserDto | null }`
  - `GradingSectionDto { attemptSectionId, attemptId, student, test, skill, submittedAt, gradingStatus, revision, assessment: AssessmentDto | null, expectedEntries: GradingExpectedEntryDto[], parts: GradingPartDto[] }`
  - `GradingPartDto { partId, order, title, instruction, questions: GradingQuestionDto[] }`
  - `GradingQuestionDto { questionId, numberFrom, questionType, instruction, prompt, content, imageUrl, audioUrl, sample, rubric, response: GradingResponseDto | null }`
  - `GradingResponseDto { text: string | null, wordCount: number | null, audioUrl: string | null }` (`audioUrl` stays null until Task 13)
  - `GradingQueryService.findQueue(dto)`, `findSection(id)`, `findAssessments(id)`

- [ ] **Step 1: Write the failing e2e tests**

- `lists pending sections, oldest first`: submit two, expect `submittedAt` ascending, `gradingStatus: 'PENDING'`, `band: null`, `grader: null`.
- `filters by status, skill, test and search`: `?gradingStatus=GRADED` shows the band and grader; `?search=<email fragment>` matches; `?testId` narrows.
- `rejects AUTO_GRADED as a queue filter`: 400.
- `keeps blank sections and Listening out of the queue`.
- `still shows a timed-out attempt`: an `EXPIRED` attempt with a pending section is listed.
- `closes an abandoned attempt when the queue loads`: a student saves an essay, the section is backdated, and nobody reads the attempt. `GET /grading/queue` lists the section and the attempt is `EXPIRED`.
- `closes an abandoned blank attempt without listing it`: same with no essay. The attempt is `EXPIRED`, the section `AUTO_GRADED`, and the queue doesn't list it.
- `leaves an attempt within its grace period open`: set the section deadline 10 seconds ago. After `GET /grading/queue` the attempt is still `IN_PROGRESS`.
- `keeps graded work after the test is unpublished or deleted`: set `status = DRAFT` on one test and `DELETED` on another. Their sections stay listed, `GET /grading/sections/:id` is 200, and `POST` is 201 (Review Focus 2).
- `returns the grading screen`: for a pending section, `revision: 0`, `assessment: null`, `expectedEntries` with `TA`/`TR` codes, and `sample`, `rubric`, `response.text` and a `wordCount` on each question. For an essay of `'One two, three.\nFour'` it is 4. A chart with `imageMediaId` returns a public `imageUrl`.
- `lists every revision, newest first, with the grader`.
- `requires READ ASSESSMENT`: `queue`, `sections/:id` and `assessments` are 403 without it and for a `web` token.

Add `attempt-expiry.service.spec.ts`, with a fake repository and a fake `StudentAttemptsService`:

```ts
it('keeps going when one attempt fails', async () => {
  overdue([
    { id: 'a', userId: 'u1' },
    { id: 'b', userId: 'u2' },
  ]);
  attempts.expireIfOverdue.mockRejectedValueOnce(new Error('boom'));
  await expect(service.expireOverdue()).resolves.toBeUndefined();
  expect(attempts.expireIfOverdue).toHaveBeenCalledWith('u2', 'b');
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm test:e2e test/grading.e2e-spec.ts`
Expected: FAIL, 404 on the new routes.

- [ ] **Step 3: Implement `AttemptExpiryService`**

Select `id` and `userId` of attempts with `status = 'IN_PROGRESS'` where `deadline_at < cutoff`, or that have an `IN_PROGRESS` section with `deadline_at < cutoff`. `cutoff` is `now - GRACE_MS`. Order by `started_at ASC`, limit `MAX_EXPIRED_PER_SWEEP = 50`. Call `expireIfOverdue` one at a time, since each takes its own `FOR UPDATE` transaction, and log failures with `Logger.warn`.

- [ ] **Step 4: Implement `findQueue`**

Call `expireOverdue()` first. Then query `AttemptSection` as `s`, inner-joining `s.attempt`, `a.user`, `a.test` and `s.testSection`. Do not filter on test status. Add the `search` block as in `users.service.ts:92-101`, covering `email`, `firstName` and `lastName`. Sort by `s.submittedAt ASC, s.id ASC`. Page, then call `findLatestAssessments` for the page's ids and load their graders.

- [ ] **Step 5: Implement `findSection`**

Load the `TestPart` tree for the section, with `addSelect('q.answer')`. Load the attempt's answers for those questions. `wordCount` is `countWords(normalizeText(text))`. For the prompt, `imageUrl` is `q.imageMediaId ?? g.imageMediaId` and `audioUrl` is `q.audioMediaId ?? g.audioMediaId ?? p.audioMediaId`, resolved through `MediaService`. `sample` and `rubric` come from `q.answer`. `revision` is the latest assessment's revision, or 0.

- [ ] **Step 6: Implement `findAssessments`**

Inner-join `grader`, order by `revision DESC`, 404 for an unknown section. Add the three `GET` routes, each with `@CheckPermissions([PermissionAction.READ, PermissionSubject.ASSESSMENT])`.

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run src/modules/student-attempts && pnpm test:e2e test/grading.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src test
git commit -m "feat: add grading queue and section review"
```

## Task 9: PR 1 documentation and contract

**Files:**

- Modify: `CLAUDE.md`, `docs/test-schema.dbml`, `docs/question-formats.md`, `docs/student-tests-api.md`, `openapi.json`

- [ ] **Step 1: Update the docs**

- `CLAUDE.md`: add a `src/modules/grading/` bullet, note `src/shared/scoring/`, and change the `student-attempts` bullet: only it and `grading` may select `questions.answer`, and `/result` opens once the attempt leaves `IN_PROGRESS`. Add that `GET /grading/queue` also closes overdue attempts, so expiry is no longer triggered only by the student.
- `docs/test-schema.dbml`: new enum and `attempt_sections.grading_status`, the `assessments` table as built (drop `grader_type_enum`, `part_id`, `model`, `criteria`, `overall`, `feedback`), the `EXPIRED` note at lines 298-300, the `overall_score` note at line 289, the five new types.
- `docs/question-formats.md`: the five new types in the summary table, with `timing` and `sample`.
- `docs/student-tests-api.md`: `/result` at line 357, the `response` format, `gradingStatus`, `assessments`, and the note that clients ignore `score`/`maxScore` for Writing.

- [ ] **Step 2: Regenerate the contract**

Run: `pnpm openapi:generate`
Expected: `openapi.json` gains the grading paths, `AttemptSectionGradingStatus`, the new `QuestionType` values and `assessment`.

- [ ] **Step 3: Run the CI gate locally**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs openapi.json
git commit -m "docs: document teacher grading for Writing"
```

Open PR 1. If `oasdiff` reports the enum additions as breaking, the PR needs the `api-breaking` label.

---

# PR 2: Speaking

Branch `feat/teacher-grading-speaking` from PR 1 before Task 10.

## Task 10: Private media

**Files:**

- Modify: `src/types/media.type.ts`, `src/shared/storage/storage.service.ts`, `src/configs/storage.config.ts`, `src/configs/env.validation.ts`, `.env.example`
- Modify: `src/modules/media/media-policy.ts`, `media.service.ts`, `dto/media.dto.ts`
- Modify: `test/utils/app.ts`
- Create: `src/migrations/<timestamp>-AddAttemptMediaScope.ts`
- Test: `src/modules/media/media.service.spec.ts`, `test/migrations.e2e-spec.ts`

**Interfaces:**

- Produces:
  - `MediaScope.ATTEMPT = 'ATTEMPT'`
  - `IMediaOwnerPolicy.privateRead?: boolean`
  - `StorageService.getDownloadUrl(key: string): Promise<string>`, `StorageService.privateCacheControl` (`'private'`), `getUploadUrl(key, contentType, cacheControl = IMMUTABLE_CACHE_CONTROL)`
  - `storageConfig.downloadUrlTtl`: `Number(process.env.STORAGE_DOWNLOAD_URL_TTL ?? 3600)`
  - `MediaService.getUrl(media: Pick<Media, 'scope' | 'storageKey'>): Promise<string>` (public)
  - The fake storage gains `getDownloadUrl: vi.fn(async (key) => 'http://signed.test/' + key)` and `privateCacheControl: 'private'`

- [ ] **Step 1: Write the failing tests**

`media.service.spec.ts`, constructing `MediaService` with fakes for the repository, storage and registry:

```ts
it('signs a URL for a privateRead scope', async () => {
  await expect(
    service.getUrl({
      scope: MediaScope.ATTEMPT,
      storageKey: 'attempts/a/audio/k.webm',
    }),
  ).resolves.toBe('http://signed.test/attempts/a/audio/k.webm');
  expect(storage.getPublicUrl).not.toHaveBeenCalled();
});
it('keeps public URLs for other scopes', async () => {
  await expect(
    service.getUrl({
      scope: MediaScope.TEST,
      storageKey: 'tests/1/audio/k.mp3',
    }),
  ).resolves.toBe('http://storage.test/tests/1/audio/k.mp3');
});
it('uploads private scopes with Cache-Control: private', async () => {
  const res = await service.createUploadUrl({
    scope: MediaScope.ATTEMPT,
    ownerId: ATTEMPT_ID,
    kind: MediaKind.AUDIO,
    contentType: 'audio/webm',
  });
  expect(res.headers['Cache-Control']).toBe('private');
  expect(storage.getUploadUrl).toHaveBeenCalledWith(
    res.storageKey,
    'audio/webm',
    'private',
  );
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm vitest run src/modules/media/media.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement storage and config**

`getDownloadUrl` uses `getSignedUrl` with `GetObjectCommand` and `expiresIn: config.downloadUrlTtl`. Add `@IsOptional() @IsNumberString() STORAGE_DOWNLOAD_URL_TTL?: string` and the `.env.example` line.

- [ ] **Step 4: Implement `MediaService`**

`getUrl` uses `this.policies.get(media.scope).privateRead`. `withUrl` becomes async, so `findAll` wraps its map in `Promise.all` and `findById`/`findOwned` await it. `createUploadUrl` picks the cache header from the policy and returns the same value it signs. Update the `ownerId` and `url` descriptions in `media.dto.ts`.

- [ ] **Step 5: Generate the migration**

Run: `pnpm migration:generate src/migrations/AddAttemptMediaScope`. Review it: it should only recreate `media_scope_enum`.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/modules/media && pnpm test:e2e test/media.e2e-spec.ts test/migrations.e2e-spec.ts`
Expected: PASS. The `AVATAR` flow still returns a public URL.

- [ ] **Step 7: Commit**

```bash
git add -A src test .env.example
git commit -m "feat: serve private media through presigned URLs"
```

## Task 11: Speaking answers and audio endpoints

**Files:**

- Create: `src/modules/student-attempts/attempt-media.policy.ts`, `attempt-audio.service.ts`
- Modify: `attempt-grader.ts`, `attempt-response.ts`, `attempt-tree.service.ts`, `attempt-grading-status.ts`, `student-attempts.service.ts`, `student-attempts.controller.ts`, `student-attempts.module.ts`, `dto/student-attempts.dto.ts`
- Create: `test/student-speaking.e2e-spec.ts`
- Test: `attempt-response.spec.ts`, `attempt-grader.spec.ts`, `attempt-grading-status.spec.ts`, `attempt-media.policy.spec.ts`

**Interfaces:**

- Consumes: `MediaScope.ATTEMPT`, `MediaService.createUploadUrl`, `create`, `deleteQuietly`
- Produces:
  - `AttemptResponse` gains `{ mediaId: number }`
  - `ATTEMPT_AUDIO_MAX_BYTES = 20 * MB` in `attempt-media.policy.ts`
  - `isValidSpeakingSection(questions: readonly Pick<ITreeQuestion, 'questionType'>[]): boolean`
  - `isSpeakingQuestion(type: QuestionType): boolean`
  - `CreateAttemptAudioUploadDto { questionId; contentType; size }`, `ConfirmAttemptAudioDto { questionId; storageKey }`
  - `StudentAttemptsService.assertAudioQuestionOpen(userId, id, questionId): Promise<void>`
  - `StudentAttemptsService.saveAudio(userId, id, questionId, mediaId): Promise<{ answer: AttemptAnswerStateDto; previousMediaId: number | null }>`
  - `AttemptAudioService.createUploadUrl(userId, id, dto)`, `confirm(userId, id, dto)`

- [ ] **Step 1: Write the failing unit tests**

```ts
describe('Speaking', () => {
  const q = question({ questionType: QuestionType.IELTS_SPEAKING_PART_2, keys: null });
  it.each([[null], [{ text: 'x' }], [{ mediaId: 1 }]])('refuses %j through autosave', (raw) =>
    expect(() => parseResponse(q, raw)).toThrow('audio endpoint'));
});

// attempt-grader.spec.ts
it('treats a recording as an answer', () => expect(isBlankResponse({ mediaId: 5 })).toBe(false));

// attempt-grading-status.spec.ts
it('requires Speaking questions only', () => {
  expect(isValidSpeakingSection([{ questionType: QuestionType.IELTS_SPEAKING_PART_1 }])).toBe(true);
  expect(isValidSpeakingSection([])).toBe(false);
  expect(isValidSpeakingSection([{ questionType: QuestionType.READ_ALOUD }])).toBe(false);
});

// attempt-media.policy.spec.ts
it('is private, audio only, 20 MB', () => {
  expect(policy).toMatchObject({ scope: MediaScope.ATTEMPT, prefix: 'attempts', privateRead: true, maxBytes: { AUDIO: 20 * 1024 * 1024 } });
});
it('accepts an IN_PROGRESS attempt', () => /* existsBy true → resolves */);
it('rejects a closed attempt', () => /* existsBy false → ConflictException */);
it('rejects an owner that is not a uuid', () => /* BadRequestException, repo not called */);
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm vitest run src/modules/student-attempts`
Expected: FAIL.

- [ ] **Step 3: Implement the response rules**

`parseResponse` checks `isSpeakingQuestion` first, before the null return, and fails with `recordings are saved through the audio endpoint`.

Add `SkillType.SPEAKING` to `IELTS_SKILLS`. In `pickSections`, a chosen `SPEAKING` section must pass `isValidSpeakingSection`. `FULL` keeps excluding it until Task 13.

- [ ] **Step 4: Write the failing e2e tests**

`test/student-speaking.e2e-spec.ts`, using a `SECTION` attempt on Speaking:

- `issues an upload URL`: 201 with a `storageKey` starting `attempts/<id>/audio/`, and `headers['Cache-Control'] === 'private'`.
- `saves a recording`: with `storage.head` returning `{ size: 1024, contentType: 'audio/webm' }`, confirm returns an answer whose `response` is `{ mediaId }`, and the `media` row has scope `ATTEMPT` and owner `<id>`.
- `re-recording deletes the previous media`: the old row is gone, `storage.delete` got its key, and `flagged` survives.
- `rejects another student's attempt`: `upload-url` and confirm are 404.
- `rejects a Writing question`: 400.
- `rejects more than 20 MB up front`: `size: 20 * 1024 * 1024 + 1` is 400.
- `rejects an oversized or wrong-type object at confirm`: 400 and the object is deleted.
- `rejects a missing object`: 400 when `head` returns null.
- `rejects a key from another attempt`: 400.
- `rejects audio for a section that is not open`: on a `SECTION` attempt of Writing then Speaking, confirming while Writing is open is 409 `SECTION_NOT_OPEN`. On a Speaking-only attempt, confirming after submit is 409 `ATTEMPT_CLOSED`.
- `removes the new media when the section closes during confirm`: make `storage.head` submit the section before resolving. Expect 409 and no new `media` row.
- `refuses autosave on Speaking, so a null cannot erase a recording`: after a recording, `PUT /answers` with `{ response: null, flagged: true }` is 400 and the stored answer still has `mediaId` (Review Focus 1).
- `sends a recorded section to the queue`: submit, section `PENDING`. With no recordings, `AUTO_GRADED` at 0.

- [ ] **Step 5: Implement the policy and services**

`AttemptMediaPolicy` follows `AvatarMediaPolicy`: `scope = ATTEMPT`, `prefix = 'attempts'`, `privateRead = true`, `maxBytes = { [MediaKind.AUDIO]: ATTEMPT_AUDIO_MAX_BYTES }`. `assertOwnerWritable` validates with `isUUID` and checks `existsBy({ id, status: IN_PROGRESS })`, else `ConflictException`.

In `StudentAttemptsService`, extract the per-question lookup from `saveAnswers` into a private `openQuestion(ctx, questionId)`, which raises the existing 400 and `SECTION_NOT_OPEN`. `assertAudioQuestionOpen` and `saveAudio` run through `withAttempt(..., true, ...)` and also 400 on a non-Speaking question. `saveAudio` reads the stored row, upserts `{ mediaId }` with `answeredAt: now` and the stored `flagged`, and returns the previous `mediaId`.

`AttemptAudioService.confirm`:

```ts
await this.attempts.assertAudioQuestionOpen(userId, id, questionId);
const media = await this.media.create(
  { scope: MediaScope.ATTEMPT, ownerId: id, kind: MediaKind.AUDIO, storageKey },
  userId,
);
const saved = await this.attempts
  .saveAudio(userId, id, questionId, media.id)
  .catch(async (error) => {
    await this.media.deleteQuietly(media.id);
    throw error;
  });
if (saved.previousMediaId)
  await this.media.deleteQuietly(saved.previousMediaId);
return saved.answer;
```

Controller: `POST :id/audio/upload-url` (`@ApiCreatedResponse({ type: UploadUrlResponseDto })`) and `POST :id/audio` (`@ApiCreatedResponse({ type: AttemptAnswerStateDto })`), both `@CheckPermissions()`. `size` is `@IsInt() @Min(1) @Max(ATTEMPT_AUDIO_MAX_BYTES)`; `contentType` is `@IsIn` the keys of `MEDIA_MIME_EXTENSIONS[MediaKind.AUDIO]`; `storageKey` is `@Matches(MEDIA_KEY_PATTERN)`.

Add `MediaModule`, `AttemptMediaPolicy` and `AttemptAudioService` to the module.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/modules/student-attempts && pnpm test:e2e test/student-speaking.e2e-spec.ts test/student-writing.e2e-spec.ts test/student-attempts.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src test
git commit -m "feat: record IELTS Speaking answers"
```

## Task 12: Per-section grace period

**Files:**

- Modify: `src/modules/student-attempts/attempt-timeline.ts`, `student-attempts.service.ts:415-428`
- Test: `attempt-timeline.spec.ts`

**Interfaces:**

- Produces: `SPEAKING_GRACE_MS = 120_000`; `ITimelineSection.skill: SkillType` (required)

- [ ] **Step 1: Write the failing tests**

Add `skill: SkillType.LISTENING` to the existing fixtures.

```ts
const ielts = (skill: SkillType) =>
  openTimeline(
    {
      examType: ExamType.IELTS_ACADEMIC,
      mode: AttemptMode.FULL,
      testDurationMinutes: null,
      sections: [{ sectionId: 1, order: 1, durationMinutes: 10, skill }],
    },
    now,
  );

it('gives Speaking two minutes of grace', () => {
  const t = ielts(SkillType.SPEAKING);
  expect(
    reconcile(ExamType.IELTS_ACADEMIC, t, at(min(10) + SPEAKING_GRACE_MS))
      .expired,
  ).toBe(false);
  expect(
    reconcile(ExamType.IELTS_ACADEMIC, t, at(min(10) + SPEAKING_GRACE_MS + 1))
      .expired,
  ).toBe(true);
});
it('keeps GRACE_MS for Writing', () => {
  expect(
    reconcile(
      ExamType.IELTS_ACADEMIC,
      ielts(SkillType.WRITING),
      at(min(10) + GRACE_MS + 1),
    ).expired,
  ).toBe(true);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm vitest run src/modules/student-attempts/attempt-timeline.spec.ts`
Expected: FAIL, `SPEAKING_GRACE_MS` undefined.

- [ ] **Step 3: Implement**

Add `graceOf(s)` and use it in the sequential branch of `reconcile`. The TOEIC branch keeps `GRACE_MS`. `openTimeline` takes `skill` through its `Pick`. In `lock()`, set `skill: sectionMeta.get(s.sectionId)?.skill`, defaulting to `SkillType.LISTENING` to match the `?? 0` fallbacks beside it.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/modules/student-attempts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: extend the grace period for Speaking uploads"
```

## Task 13: Open FULL and serve recordings

**Files:**

- Modify: `student-attempts.service.ts` (`pickSections`), `attempt-result.service.ts`, `dto/student-attempt-response.dto.ts`, `src/modules/grading/grading-query.service.ts`
- Test: `test/grading-full.e2e-spec.ts`

**Interfaces:**

- Consumes: `MediaService.getUrl`, `seedExam`
- Produces:
  - `AttemptResultQuestionDto.audioUrl: string | null`
  - `GradingResponseDto.audioUrl` populated

- [ ] **Step 1: Write the failing e2e tests**

`test/grading-full.e2e-spec.ts` seeds L/R/W/S with test-specific `ScoreScale` rows: raw 0 and raw 1 both map to 7 for Listening and 6.5 for Reading, so the blank case below has known scores.

- `runs a FULL attempt to its overall score`: start `FULL` (four sections), answer L and R correctly, write both tasks, record Speaking, submitting each section in order. Now the attempt is `SUBMITTED`, `/result` shows L = 7 and R = 6.5, `overallScore` null. Grade Writing with Task 1 = 7, 7, 7, 7 and Task 2 = 6, 7, 6, 7: 6.5, `overallScore` still null, still `SUBMITTED`. Grade Speaking with `FC/LR/GRA/P` = 6, 7, 6, 7: 6.5, `overallScore: 6.5`, status `GRADED`.
- `updates the overall score on a correction`: correct Speaking to 8, 8, 8, 8. `overallScore: 7`, and `GET /grading/sections/:id/assessments` lists revisions 2 and 1.
- `computes the overall score at finish when Writing and Speaking are blank`: `POST /submit` at once. `GRADED` and `overallScore: 3.5`, the rounded mean of 7, 6.5, 0 and 0.
- `shows recordings through signed URLs`: `/result` and `GET /grading/sections/:id` return `audioUrl` starting `http://signed.test/attempts/`.
- `never exposes a public URL for attempt audio`: `JSON.stringify` of `/result`, the grading screen and `GET /media?scope=ATTEMPT` contains no `http://storage.test/attempts/`, and `storage.getPublicUrl` was never called with an `attempts/` key.
- `survives a deleted recording`: delete the `media` row. `/result` and the grading screen are 200 with `audioUrl: null` (Review Focus 4).
- `reaches the queue after timing out in Speaking`: backdate the open section. The attempt is `EXPIRED` and the recorded section is listed.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm test:e2e test/grading-full.e2e-spec.ts`
Expected: FAIL, a `FULL` attempt has two sections.

- [ ] **Step 3: Implement**

In `pickSections`, remove the `FULL` filter and its comment.

In both `attempt-result.service.ts` and `grading-query.service.ts`, collect `mediaId` from Speaking responses, load `Media` where `id IN (...)` and `scope = ATTEMPT` and `ownerId = attempt.id`, and map each through `MediaService.getUrl`. A missing row gives `audioUrl: null`.

- [ ] **Step 4: Run the tests**

Run: `pnpm test:e2e test/grading-full.e2e-spec.ts test/grading.e2e-spec.ts test/student-attempts.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat: open Writing and Speaking in full attempts"
```

## Task 14: PR 2 documentation and contract

**Files:**

- Modify: `CLAUDE.md`, `docs/deployment.md`, `docs/test-schema.dbml`, `docs/question-formats.md`, `docs/student-tests-api.md`, `openapi.json`

- [ ] **Step 1: Update the docs**

- `CLAUDE.md`: `MediaScope.ATTEMPT`, `privateRead`, `AttemptAudioService`, and the FULL rule.
- `docs/deployment.md`: `STORAGE_DOWNLOAD_URL_TTL` in the env table; a Cloudflare rule blocking `/attempts/*` on the public media domain; the R2 CORS rule also allowing `PUT` from the student origin; grant `READ`/`CREATE` on `assessment` to the teacher role.
- `docs/test-schema.dbml`: `ATTEMPT` scope, and the overall note.
- `docs/student-tests-api.md`: the upload flow, upload after each question, 2-minute grace, `contentType` must be a bare type such as `audio/webm` rather than `audio/webm;codecs=opus`, Speaking cannot be flagged, signed `audioUrl` expires after `STORAGE_DOWNLOAD_URL_TTL` so refetch `/result`.

- [ ] **Step 2: Regenerate the contract**

Run: `pnpm openapi:generate`
Expected: the audio paths, `ATTEMPT` and `audioUrl` appear.

- [ ] **Step 3: Run the CI gate locally**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs openapi.json
git commit -m "docs: document Speaking recordings and private media"
```

Open PR 2. Before it reaches production, the deployment steps above must be done.
