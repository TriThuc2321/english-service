# Student attempts: take, submit and review a test — design

Date: 2026-10-28
Status: approved in brainstorming, pending spec review

## Goal

Let a student on the web client (`client: "web"`) take a published test, have it
graded, and see a full review. This completes the student flow that
`docs/student-tests-api.md` lists as "not built yet". It builds on the existing
`attempts`, `attempt_sections`, `attempt_answers` and `score_scales` entities
(PR #16) and the rules in `docs/test-schema.dbml`.

## Scope

In scope (phase 1):

- Full lifecycle: start → autosave answers (with flags) → submit section →
  submit attempt → result/review, plus attempt history.
- LISTENING and READING sections only; grading is synchronous at submit.
- Lazy expiry (no scheduler), as described in `test-schema.dbml`.
- Seeding default score scales from code.

Out of scope:

- Writing/Speaking (phase 2: `SUBMITTED` status, assessments, AI/teacher grading).
- Re-grading attempts when CMS staff fix `questions.answer` on a locked test.
  The grader is a pure function and scoring is one service call per attempt, so
  re-grading can be added later without a rewrite.
- CMS endpoints for score scales and per-test scale overrides (the lookup already
  prefers a `test_id` row; there is just no way to create one yet).
- Hiding the answer key until N retakes. Retakes are unlimited: a new attempt is
  allowed whenever there is no `IN_PROGRESS` one for that test.
- CMS must require a `key` answer iff the SUMMARY_COMPLETION group has a word
  bank (today either shape is accepted) — follow-up before real content.

## Module

New module `src/modules/student-attempts/`, kept apart from `student-tests` and
the CMS modules. It is the **only** student-facing code allowed to select
`questions.answer`, `questions.explanation`, `questions.evidence` and
`media.transcript`, and only in the `/result` query after the attempt is
confirmed graded and owned by the caller.

```
student-attempts.module.ts
student-attempts.controller.ts
student-attempts.service.ts     # start / get / list / saveAnswers / submitSection / submit / result
attempt-tree.service.ts         # in-process cache of the locked test structure (no answers)
attempt-timeline.ts             # pure: initial timers, reconcile(attempt, sections, now)
attempt-grader.ts               # pure: gradeAnswer, normalizeText, countWords
attempt-scoring.service.ts      # grades one attempt: blank rows, raw/max/scaled/overall
attempt-response.ts             # validates a response's shape against the question type
score-scales.seeder.ts          # onModuleInit upsert of default scales
score-scales.constant.ts        # IELTS L / IELTS AC R / IELTS GT R / TOEIC L / TOEIC R
dto/                            # request DTOs + *-response.dto.ts
```

- Error codes are added to `src/types/attempt.type.ts`.
- `QUESTION_ANSWER_KINDS` in `modules/questions/question-answer.ts` is exported
  so response validation reuses it instead of keeping a second map.

### Test structure cache (`AttemptTreeService`)

`getTree(testId)` returns, for a locked test, an immutable index:

- `sections`: `{ sectionId, skill, order, durationMinutes }[]` sorted by `order`
- `questions`: `Map<questionId, { sectionId, questionType, wordLimit, numberFrom, numberTo, options }>`
  where `options` is the set of valid keys taken from `question.content` / `group.content`
  (or the fixed TRUE/FALSE/NOT GIVEN, YES/NO/NOT GIVEN sets), or `null` for free text.

It is stored in a `Map<testId, Tree>` per process. This is safe because a locked
test's structure cannot change. Answers are **never** cached, since staff may
still edit them; they are loaded with `addSelect` at grade/result time. Every
process builds the same index, so multiple instances need no coordination.

## Endpoints

All under `/student/attempts`. The controller has `@Clients(AuthClient.WEB)`,
every handler has `@CheckPermissions()` with no arguments, and every query is
scoped to `userId = req.user.sub`. Another user's attempt returns **404**, never
403, so its existence is not revealed.

| Method | Path                                               | Purpose                                                                                                                                                |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/student/attempts`                                | Start. Body `{ testId, mode: FULL \| SECTION, sectionIds? }` (`sectionIds` required for SECTION). **201** `AttemptDto`                                 |
| `GET`  | `/student/attempts`                                | History, paginated, filters `testId`, `status`, sorted `startedAt DESC`. `Paginated<AttemptListItemDto>`                                               |
| `GET`  | `/student/attempts/:id`                            | Resume state. `AttemptDto`                                                                                                                             |
| `PUT`  | `/student/attempts/:id/answers`                    | Batch autosave `{ answers: [{ questionId, response, flagged? }] }` (1–200 items). `response: null` clears the answer. Returns `{ savedAt, serverNow }` |
| `POST` | `/student/attempts/:id/sections/:sectionId/submit` | Submit the open section; opens the next one, or grades if it was the last. `AttemptDto`                                                                |
| `POST` | `/student/attempts/:id/submit`                     | Submit the whole attempt (early submit allowed; also the only way to abandon one). Closes remaining sections and grades. `AttemptDto`                  |
| `GET`  | `/student/attempts/:id/result`                     | Scores and full review. Only when `GRADED`/`EXPIRED`, otherwise **409** `ATTEMPT_NOT_GRADED`. `AttemptResultDto`                                       |

`:sectionId` is the `test_sections.section_id` (the id the FE already has from
the test content), not the `attempt_sections` uuid.

### Response format sent by the FE

```jsonc
{ "key": "B" }          // answer kind `key`: MCQ, TFNG/YNNG, matching, labelling, TOEIC, summary with word bank
{ "keys": ["A", "D"] }  // answer kind `keys`: MULTIPLE_CHOICE_MULTI
{ "text": "colour" }    // answer kind `accepted`: completion, short answer, diagram labelling
```

Validated on save against the question (400 on failure):

- The response kind must be allowed for the question type
  (`key`→`key`, `keys`→`keys`, `accepted`→`text`). `SUMMARY_COMPLETION` accepts
  `key` when the group has a word bank (`options`), otherwise `text`.
- `key` / each of `keys` must be one of the question's valid keys (from the tree).
- `keys`: unique, 1..(numberTo − numberFrom + 1) items.
- `text`: string, max 255 characters.
- Questions whose answer kind is `sample` (Speaking/Writing) are rejected.
- The question must belong to one of the attempt's sections.

### Error codes

| Status | `code`                | When                                                                                  |
| ------ | --------------------- | ------------------------------------------------------------------------------------- |
| 404    | `TEST_NOT_FOUND`      | Start on a test that doesn't exist or isn't `PUBLISHED`                               |
| 404    | `ATTEMPT_NOT_FOUND`   | Attempt doesn't exist or belongs to another user                                      |
| 409    | `ATTEMPT_IN_PROGRESS` | Start while an `IN_PROGRESS` attempt exists for that test; body includes `attemptId`  |
| 409    | `SECTION_NOT_OPEN`    | Saving an answer for, or submitting, a section that isn't `IN_PROGRESS`               |
| 409    | `ATTEMPT_CLOSED`      | Any write on an attempt that is already graded or expired (including expiry just now) |
| 409    | `ATTEMPT_NOT_GRADED`  | `/result` before the attempt is graded                                                |

`ATTEMPT_IN_PROGRESS` needs an `attemptId` field, so it uses a dedicated
`AttemptInProgressErrorDto extends ErrorResponseDto` in the OpenAPI declaration.

An autosave that arrives after deadline + grace auto-submits and grades the
attempt, then returns 409 `ATTEMPT_CLOSED`; the FE navigates to the result.

## Lifecycle and expiry

### Start (one transaction)

1. Load the test by `testId` with `status = PUBLISHED`, else 404 `TEST_NOT_FOUND`.
2. Pick sections. Only `LISTENING`/`READING` in phase 1. FULL takes all of them;
   SECTION takes `sectionIds`, each of which must belong to the test and be L/R
   (else 400). A test with no L/R section → 400.
3. `UPDATE tests SET locked_at = now() WHERE test_id = $1 AND locked_at IS NULL`.
4. Insert the `attempt` and its `attempt_sections`. A unique violation (`23505`)
   on `uq_attempts_user_id_test_id_in_progress` maps to 409
   `ATTEMPT_IN_PROGRESS` with the existing attempt's id — this also covers
   double-clicks racing each other.

### Timers (by `examType`, not by whether `test.durationMinutes` is null)

- **TOEIC_LR**: every section starts `IN_PROGRESS` with `startedAt = now`.
  `attempt.deadlineAt = now + test.durationMinutes` for FULL, or
  `now + Σ section.durationMinutes` of the chosen sections for SECTION. Sections
  have no deadline of their own.
- **IELTS_ACADEMIC / IELTS_GENERAL**: the first section by `order` is
  `IN_PROGRESS` with `deadlineAt = startedAt + durationMinutes`; the rest are
  `NOT_STARTED`. `attempt.deadlineAt = null`.
- A null duration means no time limit for that section (or attempt).

### Locking

Every write (autosave, submit section, submit) and `GET /:id` runs in a
transaction that starts with
`SELECT … FROM attempts WHERE attempt_id = $1 AND user_id = $2 FOR UPDATE`.
Autosave, submit and expiry are therefore serialized per attempt and an attempt
can never be graded twice. `GET /` (history) and `/result` do not lock.

### `reconcile(attempt, sections, now)`

A pure function in `attempt-timeline.ts`, run right after the lock and before
anything else. `GRACE_MS = 30_000`.

- **TOEIC**: if `now > attempt.deadlineAt + grace`, all open sections become
  `EXPIRED` with `submittedAt = attempt.deadlineAt`; the attempt is graded and
  becomes `EXPIRED`.
- **IELTS**: repeat while the open section is past `deadlineAt + grace`: mark it
  `EXPIRED` with `submittedAt = deadlineAt`, then open the next section with
  `startedAt = previous deadlineAt` (not `now`), so the clock runs continuously
  as in the real exam and closing the tab is not a free pause. When the last
  section expires, grade and set the attempt to `EXPIRED`.
- An expired attempt's `submittedAt` is the deadline, not when it was noticed.
- Answers saved within the grace window are accepted (network latency).

### Submitting

- `sections/:sectionId/submit` accepts only an `IN_PROGRESS` section (else 409
  `SECTION_NOT_OPEN`). It becomes `SUBMITTED`; for IELTS the next section opens
  with `startedAt = now`. For TOEIC all sections are already open, so this only
  closes that one.
- When no section remains open or not started, the attempt is graded.
- `POST /:id/submit` sets every `IN_PROGRESS`/`NOT_STARTED` section to
  `SUBMITTED` and grades.
- Final status: `GRADED` when submitted, `EXPIRED` when it ran out of time. Both
  carry scores.

## Grading

### `gradeAnswer({ answer, numberFrom, numberTo, wordLimit }, response) → { isCorrect, score }`

| Answer kind | Rule                                                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`       | `response.key.trim() === answer.key`; score 0/1. Exact match, since the FE sends keys taken from the options                                                                              |
| `keys`      | `score` = size of the intersection (duplicates ignored, order ignored); `isCorrect = score === n` where `n = numberTo − numberFrom + 1`                                                   |
| `accepted`  | Normalize both sides; if `wordLimit` is set and the response has more words than it, the answer is **wrong**; otherwise correct when it equals any normalized `accepted` value. Score 0/1 |

- `SUMMARY_COMPLETION` is graded by the kind of its `answer`; a mismatched
  response kind cannot be saved in the first place.
- Blank (`response` null, empty text, empty `keys`): `isCorrect = null`, `score = 0`.

`normalizeText`: NFKC → lowercase → curly quotes/apostrophes to straight →
trim → collapse whitespace → strip leading/trailing `.,;:!?"'`.

`countWords`: split the normalized text on whitespace; a hyphenated word counts
as one, a number counts as one.

Optional-word notation such as `(the) station` is **not** interpreted; the CMS
lists each accepted variant explicitly, matching the current
`question-formats.md` contract.

### `AttemptScoringService.grade(manager, attempt)`

Runs inside the caller's transaction.

1. Load the attempt's questions with `answer` (`addSelect`).
2. Insert an `attempt_answers` row for every question of the attempt's sections
   that has none (`response = null`, `isCorrect = null`, `score = 0`), so the
   review and question-difficulty stats are complete.
3. Write `isCorrect`/`score` on every row.
4. Per attempt section: `rawScore = Σ score`, `maxScore = Σ (numberTo − numberFrom + 1)`,
   `scaledScore` = `score_scales` lookup on `(examType, skill, rawScore)`, the
   row with `test_id = attempt.testId` first, then the default (`test_id IS NULL`);
   `null` if neither exists. IELTS Academic and General Reading differ by `examType`.
5. `overallScore`: TOEIC_LR in FULL mode with both L and R scaled = L + R;
   otherwise `null` (SECTION mode, IELTS in phase 1).

### Default score scales

`score-scales.constant.ts` holds one row per raw score for IELTS Listening (0–40),
IELTS Academic Reading (0–40), IELTS General Reading (0–40), TOEIC Listening
(0–100 → 5–495) and TOEIC Reading (0–100 → 5–495). Values are the commonly
circulated conversion tables; ETS publishes no official TOEIC table, so the file
notes the source and that it is an approximation. `score-scales.seeder.ts` upserts
them on `onModuleInit` with
`ON CONFLICT (exam_type, skill, raw_score) WHERE test_id IS NULL DO UPDATE SET scaled_score = EXCLUDED.scaled_score`,
so the code is the source of truth until a scales CMS exists.

## Response DTOs

`AttemptDto` — returned by start, `GET /:id`, submit section and submit:

```ts
AttemptDto {
  id: string
  testId: number
  testSlug: string
  mode: AttemptMode
  status: AttemptStatus
  startedAt: string
  deadlineAt: string | null
  submittedAt: string | null
  overallScore: number | null
  serverNow: string                    // FE computes remaining time from deadline − serverNow
  sections: AttemptSectionDto[]        // sorted by order
  answers: AttemptAnswerStateDto[]     // { questionId, response, flagged, answeredAt }
}

AttemptSectionDto {
  id: string                           // attempt_sections uuid
  sectionId: number
  skill: SkillType
  order: number
  status: AttemptSectionStatus
  startedAt: string | null
  deadlineAt: string | null
  submittedAt: string | null
  rawScore: number | null
  maxScore: number | null
  scaledScore: number | null
}
```

`AttemptDto` never contains per-question `isCorrect`/`score`, even after grading;
those are only in `/result`.

`AttemptListItemDto` — history: `AttemptDto` without `answers` and `serverNow`,
plus `test: { id, slug, title, examType }`.

`AttemptResultDto`:

```ts
AttemptResultDto {
  attempt: AttemptListItemDto
  questions: AttemptResultQuestionDto[]                  // sorted by section order, then numberFrom
  transcripts: { mediaId: number; transcript: string }[] // audio media of the attempt's sections
}

AttemptResultQuestionDto {
  questionId: number
  sectionId: number
  numberFrom: number
  numberTo: number
  response: object | null
  isCorrect: boolean | null
  score: number
  maxScore: number
  flagged: boolean
  answer: object                        // { key } | { keys } | { accepted }
  explanation: string | null
  evidence: { paragraphId?: number; quote?: string } | null
}
```

- The result does not repeat the test tree; the FE already has it from
  `GET /student/tests/:slug` and joins on `questionId`. `evidence.paragraphId`
  points into that content for highlighting.
- `transcripts` covers audio attached to parts, groups and questions of the
  attempt's sections, skipping media without a transcript.
- Enums use `enumName` (`AttemptMode`, `AttemptStatus`, `AttemptSectionStatus`);
  nullable fields are `@ApiProperty({ nullable: true })`.

## Testing

Unit (no DB):

- `attempt-grader.spec.ts`: each answer kind; partial and duplicate `keys`;
  normalization (case, curly quotes, punctuation, whitespace); over `wordLimit`;
  blank responses.
- `attempt-timeline.spec.ts`: initial timers for TOEIC FULL/SECTION and IELTS;
  TOEIC expiry; IELTS cascading expiry (the next section starts at the previous
  deadline and expires too); within grace; untimed sections.
- `attempt-response.spec.ts`: wrong kind for the type, unknown key, too many
  keys, `sample` questions rejected, summary with/without word bank.

E2E (`test/student-attempts.e2e-spec.ts`, seeding tests through repositories like
`student-tests.e2e-spec.ts`):

- Start sets `locked_at`; a second start → 409 with `attemptId`; DRAFT test → 404;
  `bo` token → 403; another user's attempt → 404.
- IELTS FULL: saving a Reading answer while Listening is open → `SECTION_NOT_OPEN`;
  submitting Listening opens Reading; submitting Reading → `GRADED` with the
  expected raw/max/scaled scores.
- Expiry: backdate `deadline_at` in the DB (no fake clock); `GET /:id` → `EXPIRED`
  with scores; a later autosave → `ATTEMPT_CLOSED`.
- TOEIC FULL: `overallScore = L + R` from the seeded scales.
- `/result` before grading → 409; after → includes `answer`, `explanation`,
  `evidence`, `transcripts`. The `HIDDEN_KEYS` scan runs over every response of
  an in-progress attempt (start, get, autosave, submit section).
- No auth routes beyond login, so the 10/min auth throttle is not a concern.

## Docs and contract

- `pnpm openapi:generate` and commit `openapi.json`.
- `docs/student-tests-api.md`: add the attempts section and remove the
  "not built yet" note.
- `CLAUDE.md`: one bullet for `student-attempts`, including that it is the only
  student module allowed to select answers, and only in `/result`.
