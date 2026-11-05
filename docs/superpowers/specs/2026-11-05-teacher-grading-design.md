# Teacher grading for IELTS Writing and Speaking — design

Date: 2026-11-05
Status: approved in brainstorming, pending spec review

## Goal

Let a student submit IELTS Writing essays and Speaking recordings, and let a
teacher on the backoffice grade them. This is the "phase 2" that
`docs/superpowers/specs/2026-10-28-student-attempts-design.md` left out of
scope: until now only Listening and Reading can be answered, and they are graded
synchronously at submit.

## Decisions

- End-to-end flow for IELTS Writing and Speaking.
- One shared queue with no locking or assignment. Concurrent edits are rejected
  with a 409 rather than silently overwritten.
- Teachers enter criteria; the server computes every band.
- Results appear section by section: Listening/Reading stay available at once,
  Writing/Speaking appear as they are graded, and the overall score appears once
  all four skills are scored.
- Grades can be corrected. Every correction is kept as a new revision.
- A grade takes effect immediately: there is no draft or publish step.
- Recordings are private and served through expiring presigned URLs.

Out of scope:

- TOEIC Speaking & Writing grading and its scales.
- AI grading.
- Assigning work to teachers, or scoping by class.
- Per-question Speaking feedback and inline essay annotations.
- Correcting Listening/Reading scores.
- Notifying students, by email or otherwise.
- Updating the `import-test` skill (follow-up).

## Attempt lifecycle

`attempts.status` keeps describing how an attempt ended, and grading progress
moves to the section. A new `attempt_sections.grading_status` decides what the
queue and `/result` show.

| `grading_status` | Meaning                                                     |
| ---------------- | ----------------------------------------------------------- |
| `null`           | The attempt has not finished                                |
| `AUTO_GRADED`    | Scored at finish: Listening/Reading, or a blank W/S section |
| `PENDING`        | Waiting for a teacher                                       |
| `GRADED`         | Has at least one assessment                                 |

At `finish()`, sections are resolved one by one:

- Listening/Reading: graded as today, `AUTO_GRADED`.
- Writing/Speaking with at least one non-blank response: `PENDING`, with
  `raw_score`, `max_score` and `scaled_score` null.
- Writing/Speaking with every response blank: `AUTO_GRADED`, `scaled_score` 0,
  `raw_score` and `max_score` null. It never reaches the queue.

The attempt then becomes:

- `EXPIRED` when it timed out, whether or not sections are pending. This changes
  the meaning of `EXPIRED`, which used to imply "has its scores". Update the
  comment in `attempt.entity.ts` and the note in `docs/test-schema.dbml`.
- `SUBMITTED` when it was submitted and at least one section is `PENDING`.
- `GRADED` when it was submitted and nothing is pending.

When the last `PENDING` section is graded, a `SUBMITTED` attempt becomes
`GRADED`. An `EXPIRED` attempt stays `EXPIRED`.

Writing/Speaking answers keep `attempt_answers.is_correct` and `score` null.
`/result` still reports these rows through its existing `score`/`maxScore`
fields, which clients must ignore for W/S in favour of the section's assessment.

## Data model

### `attempt_sections`

Add `grading_status`, enum `attempt_section_grading_status_enum`, nullable. Add
a partial index on rows where it is `PENDING`, for the queue. The migration
backfills `AUTO_GRADED` for sections of attempts that are no longer
`IN_PROGRESS`.

### `assessments` (new, append-only)

| Column               | Type         | Notes                            |
| -------------------- | ------------ | -------------------------------- |
| `assessment_id`      | uuid         | Primary key                      |
| `attempt_section_id` | uuid         | FK, cascades with the section    |
| `revision`           | int          | Unique with `attempt_section_id` |
| `grader_id`          | uuid         | FK to `users`                    |
| `band`               | numeric(3,1) | Band of the section              |
| `details`            | jsonb        | See below                        |
| `created_at`         | timestamptz  |                                  |

```jsonc
// Writing has one entry per task; Speaking has one entry with partId null
{
  "entries": [
    {
      "partId": 12,
      "criteria": { "TA": 7, "CC": 6.5, "LR": 7, "GRA": 6 },
      "band": 6.5,
      "feedback": "...",
    },
  ],
}
```

The highest revision is the current grade. Rows are never updated. The section's
`scaled_score` holds the current band, so `/result`, history and the overall
score read one place.

This differs from the draft in `docs/test-schema.dbml`, which has one row per
part plus `grader_type` and `model`. A teacher submits a whole section in one
request, so one row per submission keeps a revision complete. The two AI columns
are left for the migration that adds AI grading. Update the DBML to match.

### Question types

Add `IELTS_WRITING_TASK_1`, `IELTS_WRITING_TASK_2`, `IELTS_SPEAKING_PART_1`,
`IELTS_SPEAKING_PART_2` and `IELTS_SPEAKING_PART_3` to `QuestionType`. All use a
`sample` answer and optional `timing` content. The Task 1 chart uses the existing
`image_media_id`.

`POST /tests/import` accepts them. Its validator additionally requires an IELTS
Writing section to have exactly two parts, Task 1 and Task 2, with one question
each.

### Permissions

Add `PermissionSubject.ASSESSMENT`.

## Band calculation

A pure module with unit tests:

- Task band: mean of the four criteria.
- Writing band: `(task1 + 2 × task2) / 3`.
- Speaking band: mean of the four criteria.
- Overall: mean of the four skills, only for a `FULL` IELTS attempt with all four
  scaled scores.

Each result rounds to the nearest 0.5, and a value exactly on .25 or .75 rounds
up. This is the overall rule already in `docs/test-schema.dbml`. Applying it to
task and section bands is a choice made here for consistency, not a published
IELTS rule, so it lives in a single function.

## Student API

### Answering

`AttemptTreeService` stops filtering sections to Listening/Reading, and
`pickSections` and its error messages follow. `responseField` gains two response
shapes:

- Writing: `{ text }`, up to 20,000 characters, with no word limit enforced.
- Speaking: `{ mediaId }`, written only by the audio endpoint below.

### Audio

Each Speaking question has one recording. `POST /media` is BO-only, so students
get their own endpoints, which reuse `MediaService`:

- `POST /student/attempts/:id/audio/upload-url` with
  `{ questionId, contentType, size }` checks that the caller owns the attempt and
  the question's section is open, then returns a presigned PUT.
- `POST /student/attempts/:id/audio` with `{ questionId, storageKey }` checks the
  object with `HeadObject`, creates the `media` row, writes the answer and returns
  the answer state. Re-recording hard-deletes the previous media.

A new `MediaScope.ATTEMPT` and `AttemptMediaPolicy` live in `student-attempts`:
prefix `attempts`, owner is the attempt id, the attempt must be `IN_PROGRESS`,
audio only, at most 20 MB per file.

The grace period becomes per section: 2 minutes for Speaking, `GRACE_MS` for the
rest. Clients must upload after each question rather than at the end.

### Private audio

- `StorageService.getDownloadUrl(key)` signs a GET. Its TTL comes from
  `STORAGE_DOWNLOAD_URL_TTL`, default 3600 seconds.
- `IMediaOwnerPolicy` gains a `privateRead` flag. `MediaService` signs a URL for
  those scopes instead of calling `getPublicUrl`, including in `GET /media`
  responses.
- Objects in this scope upload with `Cache-Control: private`.

Operations, recorded in `docs/deployment.md`:

- A Cloudflare rule blocks `/attempts/*` on the public domain, because the whole
  bucket is otherwise public. Without it the keys are still unguessable UUIDs.
- The bucket CORS rule allows `PUT` from the student origin.

### `/result`

- Returns 409 `ATTEMPT_NOT_GRADED` only for `IN_PROGRESS`. Any finished attempt
  can be read.
- `AttemptSectionDto` gains `gradingStatus`, which also reaches history.
- `AttemptResultDto` gains `assessments`, one per graded section:
  `{ attemptSectionId, band, entries }` from the latest revision. It carries no
  grader identity and no earlier revisions.
- Speaking questions include a presigned audio URL.
- `sample` is returned even while a section is pending: the attempt is closed, so
  there is nothing left to protect.

## Backoffice API

New module `src/modules/grading/`, `@Clients(AuthClient.BO)`, kept apart from
`student-attempts` so CMS shapes can't leak into student code. It is allowed to
read `questions.answer`.

| Endpoint                                 | Permission          |
| ---------------------------------------- | ------------------- |
| `GET /grading/queue`                     | `READ ASSESSMENT`   |
| `GET /grading/sections/:id`              | `READ ASSESSMENT`   |
| `POST /grading/sections/:id/assessments` | `CREATE ASSESSMENT` |
| `GET /grading/sections/:id/assessments`  | `READ ASSESSMENT`   |

`:id` is the attempt section id.

### `GET /grading/queue`

Paginated. Filters: `gradingStatus` (default `PENDING`, accepts `PENDING` or
`GRADED`), `skill`, `testId`, and a search on student name or email. Oldest
submission first. Each row has the student, the test, the skill, `submittedAt`,
`gradingStatus`, and the current band and grader when graded.

### `GET /grading/sections/:id`

Everything a grading screen needs, per part: the prompt (content, image, audio),
`sample` and `rubric`, and the student's work (text with a server-side word
count, or audio URLs). Also the current assessment, the current revision (0 when
ungraded) and the criteria codes to fill in.

### `POST /grading/sections/:id/assessments`

```jsonc
{
  "expectedRevision": 0,
  "entries": [
    {
      "partId": 12,
      "criteria": { "TA": 7, "CC": 6, "LR": 7, "GRA": 6 },
      "feedback": "...",
    },
  ],
}
```

Validation:

- Writing needs exactly one entry per task. Speaking needs exactly one entry with
  `partId: null`.
- Task 1 criteria are `TA/CC/LR/GRA`, Task 2 `TR/CC/LR/GRA`, Speaking
  `FC/LR/GRA/P`.
- Each criterion is 0 to 9 in steps of 0.5.
- `feedback` is optional, up to 5,000 characters.

In one transaction, taking `FOR UPDATE` on the attempt row like the existing
attempt flows:

1. Reject unless the section is `PENDING` or `GRADED`.
2. Compare `expectedRevision` with the latest revision.
3. Compute the bands and insert the assessment with the next revision.
4. Set the section's `scaled_score` and `grading_status = GRADED`.
5. Recompute the overall score.
6. Move a `SUBMITTED` attempt with nothing pending to `GRADED`.

### `GET /grading/sections/:id/assessments`

Every revision, newest first, with the grader.

## Errors

| Case                                      | Status | `code`                         |
| ----------------------------------------- | ------ | ------------------------------ |
| Stale `expectedRevision`                  | 409    | `ASSESSMENT_REVISION_CONFLICT` |
| Section is `AUTO_GRADED` or not finished  | 409    | `SECTION_NOT_GRADABLE`         |
| Wrong criteria or missing tasks           | 400    | Message names the entry        |
| Audio confirmed after the section closed  | 409    | `SECTION_NOT_OPEN` (existing)  |
| Audio object missing or of the wrong type | 400    | Message                        |

## Testing

Unit:

- Band calculation and rounding, including values exactly on .25 and .75.
- `parseResponse` for the new question types.
- `grading_status` resolution at finish.
- Entry validation.

E2E:

- Full flow: a `FULL` attempt shows Listening/Reading at once, a teacher grades
  Writing then Speaking, the overall score appears and the attempt is `GRADED`.
- A correction updates the overall score and appears in the revision list.
- A stale `expectedRevision` gets 409.
- Missing permissions and `web` tokens are rejected.
- A timed-out attempt stays `EXPIRED` and still reaches the queue. A blank section
  does not.
- A student can't get an upload URL for someone else's attempt.
- No response exposes a public URL for attempt audio.

`test/migrations.e2e-spec.ts` covers the migration. Removing enum values in
`down` requires recreating the type.

## Delivery

One spec, two independently usable PRs:

1. **Writing end-to-end.** Schema, question types, student Writing, `/result`,
   and the `grading` module. Writing opens through `SECTION` mode only: `FULL`
   stays Listening/Reading, because a `FULL` IELTS attempt runs its sections in
   order and could not get past Speaking.
2. **Speaking.** `MediaScope.ATTEMPT`, presigned GET, the audio endpoints, the
   per-section grace period and the deployment notes. This PR opens Writing and
   Speaking in `FULL`, which also makes the overall score reachable.

Each PR updates `CLAUDE.md`, `docs/test-schema.dbml`,
`docs/question-formats.md` and `openapi.json`. New enum values may be reported as
breaking by `oasdiff`, in which case the PR needs the `api-breaking` label.

The student frontend needs to handle sections in progress of being graded in
`/result`, and no longer sees a 409 there for `SUBMITTED` attempts.
