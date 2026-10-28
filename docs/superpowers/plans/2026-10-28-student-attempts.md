# Student Attempts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students on the web client can start a published Listening/Reading test, autosave answers, submit (or run out of time), and get a graded result with a full review.

**Architecture:** A new `student-attempts` NestJS module. Pure functions (`attempt-grader.ts`, `attempt-timeline.ts`, `attempt-response.ts`) hold the grading, timing and validation rules; `AttemptTreeService` caches the immutable structure of locked tests; `AttemptScoringService` writes scores inside the caller's transaction; `StudentAttemptsService` runs the lifecycle with a `FOR UPDATE` lock and lazy expiry.

**Tech Stack:** NestJS 12 (ESM, `.js` import suffixes), TypeORM + PostgreSQL 16, class-validator, @nestjs/swagger, Vitest + supertest + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-10-28-student-attempts-design.md`

## Global Constraints

- All relative imports end in `.js`; run `pnpm format` instead of ordering imports by hand.
- No redundant comments — only non-obvious WHY.
- Controller: `@Clients(AuthClient.WEB)`, `@ApiBearerAuth()`, `@Controller('student/attempts')`, `@ApiTags('Student Attempts')`; every handler `@CheckPermissions()` (no args). User id is `req.user.id` (`IRequestWithUser`).
- Another user's attempt → 404 `ATTEMPT_NOT_FOUND`, never 403.
- Errors are `HttpException({ message, code }, status)`; codes: `TEST_NOT_FOUND`, `ATTEMPT_NOT_FOUND`, `ATTEMPT_IN_PROGRESS` (+ `attemptId`), `SECTION_NOT_OPEN`, `ATTEMPT_CLOSED`, `ATTEMPT_NOT_GRADED`.
- `GRACE_MS = 30_000`.
- Phase 1 only includes `LISTENING`/`READING` sections.
- Timers by `examType`: TOEIC_LR → one attempt deadline, all sections open; IELTS_* → sequential section deadlines.
- Only `/result` may `addSelect` `q.answer`, `q.explanation`, `q.evidence`, `m.transcript`, and only after the status is `GRADED`/`EXPIRED`.
- Response DTOs: nullable-but-present fields use `@ApiProperty({ nullable: true })`; enums use `enumName` (`AttemptMode`, `AttemptStatus`, `AttemptSectionStatus`, and the existing `SkillType`/`ExamType` names).
- Commits use conventional format and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Two autosaves or submit+autosave racing on one attempt — must serialize via `FOR UPDATE` and grade exactly once (Task 6: concurrent submit test).
2. Student away for longer than all IELTS sections combined — every section must expire in one `GET`, with the next section's `startedAt` equal to the previous deadline (Task 2 unit test + Task 6 e2e).
3. Double-click start — the unique-index race must return 409 with the existing `attemptId`, not 500 (Task 6: `Promise.all` of two starts).
4. A test with no question rows answered at all — submit must still produce `rawScore = 0` and blank `attempt_answers` rows for every question (Task 6).
5. Free text with extra spaces/curly quotes/trailing period and a word-limit overflow (Task 1).

---

### Task 1: Grader (pure)

**Files:**
- Create: `src/modules/student-attempts/attempt-grader.ts`
- Test: `src/modules/student-attempts/attempt-grader.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AttemptResponse = { key: string } | { keys: string[] } | { text: string };
  export interface IGradable { answer: Record<string, unknown>; numberFrom: number; numberTo: number; wordLimit?: number | null }
  export interface IGrade { isCorrect: boolean | null; score: number }
  export const maxScoreOf: (q: Pick<IGradable, 'numberFrom' | 'numberTo'>) => number; // numberTo - numberFrom + 1
  export function normalizeText(value: string): string;
  export function countWords(normalized: string): number;
  export function gradeAnswer(q: IGradable, response: AttemptResponse | null | undefined): IGrade;
  ```

- [ ] **Step 1: Write the failing tests** — `describe('gradeAnswer')`:
  - `{key:'B'}` vs `{key:'B'}` → `{isCorrect:true, score:1}`; vs `{key:'C'}` → `{false, 0}`; `{key:' B '}` → correct.
  - `keys` with `numberFrom:21, numberTo:22`, answer `['A','D']`: `['D','A']` → `{true,2}`; `['A','C']` → `{false,1}`; `['A','A']` → `{false,1}`.
  - `accepted ['colour','color']`: `{text:'  Colour. '}` → correct; `{text:'COLOR'}` → correct; `{text:'colours'}` → wrong.
  - Curly quotes: accepted `["children's"]`, `{text:'Children’s'}` → correct.
  - `wordLimit: 2`, accepted `['train station']`: `{text:'the train station'}` → `{false,0}` even if `'the train station'` were accepted; `{text:'train station'}` → correct.
  - Hyphen and number count as one word: `countWords(normalizeText('well-known 1990'))` → `2`.
  - Blank: `null`, `{text:'   '}`, `{keys:[]}` → `{isCorrect:null, score:0}`.
  - `normalizeText('  “Hello”,   World! ')` → `'"hello", world'`.

- [ ] **Step 2: Run** `pnpm vitest run src/modules/student-attempts/attempt-grader.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** in `attempt-grader.ts`. `normalizeText`: `.normalize('NFKC').toLowerCase()`, replace `[‘’‛]`→`'` and `[“”„]`→`"`, trim, collapse `\s+` to one space, strip leading/trailing `[.,;:!?"']+`. Grading branches on the key present in `answer` (`key`/`keys`/`accepted`); a response of the wrong kind grades as wrong (`score 0`, `isCorrect false`).

- [ ] **Step 4: Run** the same command — Expected: PASS.

- [ ] **Step 5: Commit** `feat: add attempt answer grader`

---

### Task 2: Timeline (pure)

**Files:**
- Create: `src/modules/student-attempts/attempt-timeline.ts`
- Test: `src/modules/student-attempts/attempt-timeline.spec.ts`

**Interfaces:**
- Consumes: `AttemptStatus`, `AttemptSectionStatus`, `AttemptMode` (`src/types/attempt.type.ts`), `ExamType`.
- Produces:
  ```ts
  export const GRACE_MS = 30_000;
  export interface ITimelineSection { sectionId: number; order: number; durationMinutes: number | null;
    status: AttemptSectionStatus; startedAt: Date | null; deadlineAt: Date | null; submittedAt: Date | null }
  export interface ITimeline { deadlineAt: Date | null; sections: ITimelineSection[] } // sections sorted by order
  export function openTimeline(input: { examType: ExamType; mode: AttemptMode; testDurationMinutes: number | null;
    sections: Pick<ITimelineSection, 'sectionId' | 'order' | 'durationMinutes'>[] }, now: Date): ITimeline;
  export function reconcile(examType: ExamType, timeline: ITimeline, now: Date): { timeline: ITimeline; expired: boolean };
  export function submitSection(examType: ExamType, timeline: ITimeline, sectionId: number, now: Date): ITimeline; // throws nothing; caller checks status first
  export function closeAll(timeline: ITimeline, now: Date): ITimeline; // IN_PROGRESS/NOT_STARTED → SUBMITTED
  export const isFinished: (timeline: ITimeline) => boolean; // no IN_PROGRESS or NOT_STARTED left
  ```
  All functions return new objects; they never mutate the input.

- [ ] **Step 1: Write the failing tests**, with `now = new Date('2026-10-28T10:00:00Z')`:
  - `openTimeline` TOEIC FULL, `testDurationMinutes:120`, sections L(order 1, 45) R(order 2, 75): `deadlineAt = now+120m`; both `IN_PROGRESS`, `startedAt = now`, section `deadlineAt = null`.
  - TOEIC SECTION with only R(75): `deadlineAt = now+75m`.
  - IELTS FULL L(30) R(60): `deadlineAt null`; L `IN_PROGRESS`, `deadlineAt = now+30m`; R `NOT_STARTED`, all dates null.
  - IELTS section with `durationMinutes: null` → `IN_PROGRESS`, `deadlineAt null`, never expires in `reconcile`.
  - `reconcile` TOEIC at `deadline + 29s` → `expired:false`, unchanged; at `deadline + 31s` → `expired:true`, all sections `EXPIRED` with `submittedAt = attempt deadline`.
  - IELTS cascade: L opened at `now`, reconcile at `now + 2h` → L `EXPIRED` (`submittedAt = now+30m`), R `startedAt = now+30m`, `deadlineAt = now+90m`, `EXPIRED`, `submittedAt = now+90m`; `expired:true`.
  - IELTS partial: reconcile at `now + 31m` (past L deadline + grace) → L `EXPIRED`, R `IN_PROGRESS` with `startedAt = now+30m`; `expired:false`.
  - `submitSection` IELTS L at `now+10m` → L `SUBMITTED` (`submittedAt now+10m`), R `IN_PROGRESS`, `startedAt now+10m`, `deadlineAt now+70m`.
  - `submitSection` TOEIC L → L `SUBMITTED`, R still `IN_PROGRESS`.
  - `closeAll` sets every open/not-started section to `SUBMITTED` with `submittedAt = now`; `isFinished` true afterwards.

- [ ] **Step 2: Run** `pnpm vitest run src/modules/student-attempts/attempt-timeline.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** in `attempt-timeline.ts`. TOEIC SECTION deadline = `Σ durationMinutes` of chosen sections (`null` if any is null); TOEIC FULL uses `testDurationMinutes`. IELTS "open next" = first `NOT_STARTED` section by `order`, `deadlineAt = startedAt + durationMinutes` (or `null`). The IELTS cascade is a loop over the open section while `now > deadlineAt + GRACE_MS`.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `feat: add attempt timeline rules`

---

### Task 3: Score scales and module skeleton

**Files:**
- Create: `src/modules/student-attempts/score-scales.constant.ts`, `score-scales.constant.spec.ts`, `score-scales.seeder.ts`, `student-attempts.module.ts`
- Modify: `src/app.module.ts` (import `StudentAttemptsModule` next to `StudentTestsModule`)

**Interfaces:**
- Produces:
  ```ts
  export interface IScaleRow { examType: ExamType; skill: SkillType; rawScore: number; scaledScore: number }
  export const DEFAULT_SCORE_SCALES: IScaleRow[];
  @Injectable() export class ScoreScalesSeeder implements OnModuleInit {}
  @Module(...) export class StudentAttemptsModule {} // TypeOrmModule.forFeature([Attempt, AttemptSection, AttemptAnswer, ScoreScale, Test, Question, Media]), StorageModule
  ```

Values (the constant expands ranges / interpolates to one row per raw score; note in a short comment that these are commonly circulated approximations and ETS publishes no official TOEIC table):

- IELTS Listening (both `IELTS_ACADEMIC` and `IELTS_GENERAL`), raw→band: 39–40 9, 37–38 8.5, 35–36 8, 32–34 7.5, 30–31 7, 26–29 6.5, 23–25 6, 18–22 5.5, 16–17 5, 13–15 4.5, 10–12 4, 8–9 3.5, 6–7 3, 4–5 2.5, 2–3 2, 1 1, 0 0.
- IELTS Academic Reading: 39–40 9, 37–38 8.5, 35–36 8, 33–34 7.5, 30–32 7, 27–29 6.5, 23–26 6, 19–22 5.5, 15–18 5, 13–14 4.5, 10–12 4, 8–9 3.5, 6–7 3, 4–5 2.5, 2–3 2, 1 1, 0 0.
- IELTS General Reading: 40 9, 39 8.5, 37–38 8, 36 7.5, 34–35 7, 32–33 6.5, 30–31 6, 27–29 5.5, 23–26 5, 19–22 4.5, 15–18 4, 12–14 3.5, 9–11 3, 6–8 2.5, 4–5 2, 1–3 1, 0 0.
- TOEIC_LR, raw 0–100, linear interpolation between anchors, rounded to the nearest 5, clamped to 5–495:
  - Listening anchors: 0→5, 10→40, 20→95, 30→145, 40→195, 50→250, 60→305, 70→360, 80→410, 90→465, 96→495, 100→495.
  - Reading anchors: 0→5, 10→30, 20→75, 30→125, 40→175, 50→225, 60→280, 70→335, 80→390, 90→445, 100→495.

- [ ] **Step 1: Write the failing test** `score-scales.constant.spec.ts`: for each `(examType, skill)` pair (IELTS_ACADEMIC/IELTS_GENERAL × L/R, TOEIC_LR × L/R) the rows cover every raw score exactly once (0–40 IELTS, 0–100 TOEIC) and `scaledScore` never decreases as raw increases. Spot checks: IELTS_ACADEMIC LISTENING 30 → 7; IELTS_GENERAL READING 30 → 6; TOEIC LISTENING 100 → 495, 0 → 5; TOEIC READING 50 → 225.
- [ ] **Step 2: Run** `pnpm vitest run src/modules/student-attempts/score-scales.constant.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the constant, then the seeder: in `onModuleInit`, one `INSERT INTO score_scales (exam_type, skill, test_id, raw_score, scaled_score) VALUES … ON CONFLICT (exam_type, skill, raw_score) WHERE test_id IS NULL DO UPDATE SET scaled_score = EXCLUDED.scaled_score` via `dataSource.query` (or `createQueryBuilder().insert().orUpdate(['scaled_score'], ['exam_type','skill','raw_score'], { indexPredicate: '"test_id" IS NULL' })`). Register the module in `app.module.ts`.
- [ ] **Step 4: Run** the spec — PASS; then `pnpm typecheck` and `pnpm vitest run --config ./vitest.config.e2e.ts test/student-tests.e2e-spec.ts` — PASS (the app still boots with the seeder; `openapi:generate` preview mode has no DB, so guard the seeder: skip when `this.dataSource.isInitialized` is false).
- [ ] **Step 5: Commit** `feat: seed default score scales`

---

### Task 4: Test tree cache and response validation

**Files:**
- Create: `src/modules/student-attempts/attempt-tree.service.ts`, `attempt-response.ts`, `attempt-response.spec.ts`
- Modify: `src/modules/questions/question-answer.ts` (export `QUESTION_ANSWER_KINDS` and `type AnswerKind`), `student-attempts.module.ts` (provider)

**Interfaces:**
- Consumes: `AttemptResponse` (Task 1).
- Produces:
  ```ts
  export interface ITreeQuestion { id: number; sectionId: number; questionType: QuestionType; wordLimit: number | null;
    numberFrom: number; numberTo: number; keys: ReadonlySet<string> | null } // null = any key / free text
  export interface ITreeSection { sectionId: number; skill: SkillType; order: number; durationMinutes: number | null }
  export interface IAttemptTree { testId: number; sections: ITreeSection[]; questions: ReadonlyMap<number, ITreeQuestion>;
    mediaIds: ReadonlyMap<number, number[]> } // sectionId → audio media ids (part, group, question)
  @Injectable() export class AttemptTreeService { get(testId: number): Promise<IAttemptTree> }
  export function parseResponse(q: ITreeQuestion, raw: unknown): AttemptResponse | null; // throws BadRequestException
  ```

`keys` per question: `question.content.options[].key` if present, else `group.content.options[].key` if present, else `null` (TRUE/FALSE/YES/NO keys are not fixed in the codebase, so they are not checked). `SUMMARY_COMPLETION` takes `key` when the group content has `options`, else `text`.

- [ ] **Step 1: Write the failing tests** `attempt-response.spec.ts` (build `ITreeQuestion` literals):
  - MULTIPLE_CHOICE keys {A,B,C}: `{key:'B'}` → returns it; `{key:'Z'}` → throws 400; `{text:'B'}` → throws; `{key:'B', extra:1}` → throws.
  - MULTIPLE_CHOICE_MULTI 21–22: `{keys:['A','C']}` ok; `{keys:['A','B','C']}` throws; `{keys:['A','A']}` throws.
  - FORM_COMPLETION: `{text:'abc'}` ok; 256-char text throws; `{key:'A'}` throws.
  - SUMMARY_COMPLETION with group options → `{key}` ok, `{text}` throws; without options → reverse.
  - TRUE_FALSE_NOT_GIVEN with `keys: null`: `{key:'NOT GIVEN'}` ok.
  - OPINION_ESSAY (`sample`) → throws.
  - `null` → returns `null`.
- [ ] **Step 2: Run** `pnpm vitest run src/modules/student-attempts/attempt-response.spec.ts` — FAIL.
- [ ] **Step 3: Implement** `parseResponse` using the exported `QUESTION_ANSWER_KINDS` (`key`→`key`, `keys`→`keys`, `accepted`→`text`, `sample`→rejected), then `AttemptTreeService.get`: one query joining `test_sections → test_parts → question_groups → questions` (selecting only the columns above, never `answer`), filtered to L/R sections; cache the built tree in a `Map<number, IAttemptTree>` only when the test's `lockedAt` is set (callers always lock first, so this is just a guard).
- [ ] **Step 4: Run** the spec — PASS; `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `feat: add attempt test tree and response validation`

---

### Task 5: Scoring service

**Files:**
- Create: `src/modules/student-attempts/attempt-scoring.service.ts`
- Modify: `student-attempts.module.ts`

**Interfaces:**
- Consumes: `gradeAnswer`, `maxScoreOf` (Task 1); `IAttemptTree` (Task 4).
- Produces:
  ```ts
  @Injectable() export class AttemptScoringService {
    grade(manager: EntityManager, attempt: Attempt, tree: IAttemptTree, examType: ExamType): Promise<void>;
  }
  ```
  Writes `attempt_answers.isCorrect/score` (inserting blank rows for missing questions), `attempt_sections.rawScore/maxScore/scaledScore`, `attempts.overallScore`. Does **not** change statuses — the caller does.

- [ ] **Step 1: Implement** `grade`: load `answer` for the tree's question ids of the attempt's sections (`.addSelect('q.answer')`), load existing `AttemptAnswer` rows, grade with `wordLimit` from the tree, `upsert` all rows, compute section sums, look up scales with one query `WHERE exam_type = :examType AND skill = :skill AND raw_score = :raw AND (test_id = :testId OR test_id IS NULL) ORDER BY test_id NULLS LAST LIMIT 1` per section. `overallScore` = L + R only for `TOEIC_LR` + `AttemptMode.FULL` with both scaled values present, else `null`.
- [ ] **Step 2: Run** `pnpm typecheck` — PASS. (Behaviour is covered by the e2e in Task 6.)
- [ ] **Step 3: Commit** `feat: add attempt scoring service`

---

### Task 6: Lifecycle endpoints

**Files:**
- Create: `src/modules/student-attempts/student-attempts.controller.ts`, `student-attempts.service.ts`, `dto/student-attempts.dto.ts`, `dto/student-attempt-response.dto.ts`
- Modify: `src/types/attempt.type.ts` (add `AttemptErrorCode` const, same pattern as `UserErrorEnum`), `student-attempts.module.ts`
- Test: `test/student-attempts.e2e-spec.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces (request DTOs): `StartAttemptDto { testId: number; mode: AttemptMode; sectionIds?: number[] }` (`sectionIds` `@ValidateIf(mode === SECTION)` `@ArrayNotEmpty`), `ListAttemptsDto extends PageOptionsDto { testId?: number; status?: AttemptStatus }`, `SaveAnswersDto { answers: SaveAnswerItemDto[] }` (`@ArrayMinSize(1) @ArrayMaxSize(200)`), `SaveAnswerItemDto { questionId: number; response: object | null; flagged?: boolean }`.
- Produces (response DTOs): `AttemptDto`, `AttemptSectionDto`, `AttemptAnswerStateDto`, `AttemptListItemDto`, `SaveAnswersResultDto { savedAt; serverNow }`, `AttemptInProgressErrorDto extends ErrorResponseDto { attemptId: string }` — field lists exactly as in the spec's "Response DTOs".
- Service: `start(userId, dto)`, `findAll(userId, dto)`, `findOne(userId, id)`, `saveAnswers(userId, id, dto)`, `submitSection(userId, id, sectionId)`, `submit(userId, id)`, all returning the DTO shapes.

Implementation notes the tests do not pin:
- Every write and `findOne` runs `dataSource.transaction(async (m) => …)`; first statement locks the attempt with `m.findOne(Attempt, { where: { id, userId }, lock: { mode: 'pessimistic_write' } })` (no relations — Postgres refuses `FOR UPDATE` on outer joins), then loads sections separately, maps to `ITimeline`, runs `reconcile`. If `expired`, persist the timeline, call `AttemptScoringService.grade`, set `status = EXPIRED`, `submittedAt` = attempt deadline (TOEIC) or last section's `submittedAt` (IELTS). For writes after expiry, commit that work and **then** throw `ATTEMPT_CLOSED` (throw after the transaction resolves, otherwise the grading rolls back).
- Write on a `GRADED`/`EXPIRED` attempt → 409 `ATTEMPT_CLOSED`.
- `start`: a `QueryFailedError` with `driverError.code === '23505'` and `driverError.constraint === 'uq_attempts_user_id_test_id_in_progress'` aborts the transaction; look up the existing in-progress attempt id **outside** it and throw 409 with `{ message, code: ATTEMPT_IN_PROGRESS, attemptId }`.
- `saveAnswers`: each `questionId` must be in the tree and its `sectionId` must be an `IN_PROGRESS` attempt section (else 409 `SECTION_NOT_OPEN`; unknown question → 400). Upsert on `(attemptId, questionId)`; `answeredAt = now` when `response` is not null, else `null`; omitting `flagged` keeps the stored value.
- Swagger: `@ApiCreatedResponse`/`@ApiOkResponse({ type })`, `@ApiPaginatedResponse(AttemptListItemDto)`, `@ApiNotFoundResponse`/`@ApiConflictResponse({ type: ErrorResponseDto })`, start also `@ApiConflictResponse({ type: AttemptInProgressErrorDto })`.

- [ ] **Step 1: Write the failing e2e** `test/student-attempts.e2e-spec.ts`. Seed via repositories (copy `createTest` helper style from `test/student-tests.e2e-spec.ts`): an IELTS_ACADEMIC test with L (30m, one MCQ `{key:'B'}` + one FORM_COMPLETION `accepted ['colour']`, wordLimit 1) and R (60m, one MULTIPLE_CHOICE_MULTI 3–4 `keys ['A','D']`); a TOEIC_LR test (120m) with one L and one R MCQ. Tests:
  - `start` IELTS FULL → 201, `status IN_PROGRESS`, sections `[IN_PROGRESS, NOT_STARTED]`, `tests.locked_at` not null in DB.
  - Second start same test → 409, `code ATTEMPT_IN_PROGRESS`, `attemptId` equals the first.
  - `Promise.all` of two starts on a fresh test → one 201, one 409.
  - Start on a DRAFT test → 404 `TEST_NOT_FOUND`; with a `bo` token → 403; `GET /:id` with another web user's token → 404 `ATTEMPT_NOT_FOUND`.
  - `PUT answers` for the Reading question while Listening is open → 409 `SECTION_NOT_OPEN`; invalid key `{key:'Z'}` → 400.
  - Save `{key:'B'}` + `{text:'Colour'}` flagged → `GET /:id` returns both in `answers` with `flagged true` for the second.
  - Submit Listening section → Reading `IN_PROGRESS`; save `{keys:['A','C']}`; submit Reading → `status GRADED`; sections `L rawScore 2, maxScore 2, scaledScore 2` and `R rawScore 1, maxScore 2, scaledScore 1` (seeded IELTS bands for raw 2 and 1); `overallScore null`.
  - Submit with no answers saved (TOEIC) → `GRADED`, both sections `rawScore 0`, `attempt_answers` has 2 rows with `score 0`, `is_correct null`; `overallScore` = 5 + 5 = 10.
  - TOEIC with both correct → `overallScore` = 20 (raw 1 interpolates to L 10, R 10).
  - Expiry: start IELTS on a new test, `UPDATE attempt_sections SET started_at = now() - interval '3 hours', deadline_at = now() - interval '150 minutes'` for the open section; `GET /:id` → `status EXPIRED`, both sections `EXPIRED`, scores set; then `PUT answers` → 409 `ATTEMPT_CLOSED`.
  - Concurrent `Promise.all([submit, submit])` → one 201, the other 409 `ATTEMPT_CLOSED`; `attempt_answers` not duplicated.
  - `GET /student/attempts?testId=…` → paginated, newest first, no `answers` key.
  - `HIDDEN_KEYS` (`answer`, `explanation`, `evidence`, `transcript`) absent from every response body above (reuse `collectKeys`).
- [ ] **Step 2: Run** `pnpm vitest run --config ./vitest.config.e2e.ts test/student-attempts.e2e-spec.ts` — FAIL (404 on routes).
- [ ] **Step 3: Implement** the DTOs, service and controller per the Interfaces and notes.
- [ ] **Step 4: Run** the e2e — PASS; `pnpm typecheck && pnpm lint` — PASS.
- [ ] **Step 5: Commit** `feat: add student attempt lifecycle endpoints`

---

### Task 7: Result endpoint

**Files:**
- Modify: `student-attempts.controller.ts`, `student-attempts.service.ts`, `dto/student-attempt-response.dto.ts`
- Test: `test/student-attempts.e2e-spec.ts`

**Interfaces:**
- Produces: `AttemptResultDto`, `AttemptResultQuestionDto`, `AttemptTranscriptDto { mediaId; transcript }` (fields per spec); `service.result(userId, id): Promise<AttemptResultDto>`.

- [ ] **Step 1: Write the failing e2e cases**: `/result` on an in-progress attempt → 409 `ATTEMPT_NOT_GRADED`; on another user's → 404; after the graded IELTS attempt from Task 6 → `questions` sorted L then R by `numberFrom`, MCQ item has `response {key:'B'}`, `isCorrect true`, `score 1`, `maxScore 1`, `answer {key:'B'}`, `explanation` and `evidence` as seeded; the MULTI item has `score 1`, `maxScore 2`; a part audio seeded with `transcript 'hello'` appears in `transcripts`, media without a transcript does not.
- [ ] **Step 2: Run** the e2e file — new cases FAIL.
- [ ] **Step 3: Implement** `result`: no lock; load the attempt (owner check), reject non-`GRADED`/`EXPIRED`; one query on `AttemptAnswer` joined to `question` with `.addSelect(['q.answer', 'q.explanation', 'q.evidence'])`; section and ordering from the tree; transcripts from `Media` where `id IN tree.mediaIds of the attempt's sections` and `transcript IS NOT NULL` with `.addSelect('m.transcript')` if it is select-hidden.
- [ ] **Step 4: Run** the e2e file — PASS.
- [ ] **Step 5: Commit** `feat: add student attempt result endpoint`

---

### Task 8: Contract and docs

**Files:**
- Modify: `openapi.json`, `docs/student-tests-api.md`, `CLAUDE.md`

- [ ] **Step 1:** `pnpm openapi:generate` — Expected: `openapi.json` gains the 7 `/api/student/attempts…` paths and the attempt enums as named schemas.
- [ ] **Step 2:** In `docs/student-tests-api.md`, replace the "not built yet" status note, add a contents entry and a section "Taking a test" describing each endpoint, the `response` format, timers (TOEIC vs IELTS, `serverNow`, 30s grace, auto-expiry → 409 `ATTEMPT_CLOSED`), error codes and the result shape — taken from the spec.
- [ ] **Step 3:** In `CLAUDE.md`, add a `src/modules/student-attempts/` bullet after `student-tests`: lifecycle with lazy expiry under a `FOR UPDATE` lock, tree cache of locked tests (no answers), default score scales seeded from `score-scales.constant.ts`, and that it is the only student module allowed to select `answer/explanation/evidence/transcript`, only in `/result`.
- [ ] **Step 4:** Run the CI sequence `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build` — all PASS; re-run `pnpm openapi:generate` and `git diff --exit-code openapi.json` — no diff.
- [ ] **Step 5: Commit** `docs: document student attempts API`
