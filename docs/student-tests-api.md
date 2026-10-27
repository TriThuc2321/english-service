# Student website API — taking tests

API contract for the student website (`client: "web"`). Every path is prefixed with `/api`.
The full schema is in `openapi.json` (Swagger UI at `/docs`).

> **Status:** the catalogue and test content endpoints are ready. Starting an attempt, saving answers, submitting and scoring are **not built yet** — the contract will be shared separately.

## Contents

1. [Conventions](#1-conventions)
2. [Auth](#2-auth)
3. [Test catalogue](#3-get-studenttests--test-catalogue)
4. [Test content](#4-get-studenttestsslug--test-content)
5. [Question `content` formats](#5-question-content-formats)
6. [Enums](#6-enums)

---

## 1. Conventions

- **Auth:** every endpoint below except `/auth/*` needs `Authorization: Bearer <access_token>`. The token must be issued with `client: "web"`; a token issued to the backoffice (`bo`) is rejected with `403`.
- **Access token lifetime:** about 5 minutes. On `401`, call `POST /auth/refresh` and retry once.
- **Nullable fields:** a field marked `| null` is always present in the response and can be `null`. It is never omitted.
- **Pagination:** list endpoints accept `page` (≥1, default 1) and `take` (1–1000, default 10), and return:

  ```ts
  { data: T[]; meta: { page: number; take: number; totalCount: number } }
  ```

- **Errors:** every error uses the same body:

  ```ts
  ErrorResponse {
    message: string | string[]   // validation errors (400) come back as an array
    statusCode?: number
    error?: string
    code?: string                // machine-readable reason, e.g. REFRESH_TOKEN_ROTATED
  }
  ```

  | Status | When                                                                           |
  | ------ | ------------------------------------------------------------------------------ |
  | 400    | Invalid query, params or body                                                  |
  | 401    | Missing, invalid or expired access token                                       |
  | 403    | Token was not issued for `web`                                                 |
  | 404    | Resource not found                                                             |
  | 429    | Rate limited (global: 300/min per IP; `login`, `refresh` and `logout`: 10/min) |

---

## 2. Auth

The website's server (BFF) keeps both tokens in its own cookies. The API returns both in the JSON body; it sets no cookies for `web`.

### `POST /auth/login`

```jsonc
// request
{ "client": "web", "email": "student@gmail.com", "password": "..." }

// 201
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "refresh_token_expires_at": "2026-11-26T10:00:00.000Z"
}
```

`401` means the email or password is wrong.

### Google login

1. Redirect the browser to `GET /auth/google?client=web&nonce=<random>`. `nonce` is optional; if you send it, it comes back as `state` so you can bind the callback to your own cookie.
2. After consent, the API redirects to the website's configured Google callback URL with:
   - success: `?code=<code>&state=<nonce>`; `code` is single use and expires after **60 seconds**
   - failure: `?error=google_login_failed`
3. Exchange the code: `POST /auth/refresh` with `{ "client": "web", "refreshToken": "<code>" }`. The response is the same as for login.

### `POST /auth/refresh`

```jsonc
// request
{ "client": "web", "refreshToken": "<stored refresh token>" }

// 201: same shape as login
```

- The refresh token **rotates**: store the new `refresh_token` and discard the old one.
- `401` with `code: "REFRESH_TOKEN_ROTATED"` means another request refreshed at the same time (within 30 seconds). Use the token that request got; do not log the user out.
- Any other `401` means the session is gone (expired, logged out, or revoked because an old token was reused). Send the user to login.

### `GET /auth/profile`

Returns the current user (Bearer required).

```ts
Profile {
  id: string                     // uuid
  email: string | null
  firstName: string
  lastName: string | null
  avatar: string | null          // display URL
  phone: string | null
  emailVerified: boolean
  provider: 'local' | 'google'
  status: Status
  roleId: number
  role: { id: number; name: string; code: string; canAccessCms: boolean; permissions: Permission[] }
}
```

See `ProfileDto` in `openapi.json` for `Status` and `Permission`.

### `POST /auth/logout`

```jsonc
{
  "client": "web",
  "refreshToken": "<stored refresh token>",
  "allDevices": false,
}
```

Returns `201` with no body. It also succeeds when the token is already invalid, so always clear your cookies afterwards. `allDevices: true` logs out every session of the user.

---

## 3. `GET /student/tests` — test catalogue

Lists published tests, newest first (by `publishedAt`).

**Query**

| Param      | Type       | Notes                                                 |
| ---------- | ---------- | ----------------------------------------------------- |
| `page`     | integer    | default 1                                             |
| `take`     | integer    | default 10, max 1000                                  |
| `search`   | string     | optional, max 255 characters; matches title or source |
| `examType` | `ExamType` | optional                                              |

**Response `200`**: `Paginated<StudentTestListItem>`

```ts
StudentTestListItem {
  id: number
  slug: string                       // use in the URL: GET /student/tests/:slug
  examType: ExamType
  title: string
  source: string | null              // e.g. "Cambridge IELTS 18"
  durationMinutes: number | null     // whole test
  publishedAt: string | null         // ISO date-time
  testSections: StudentTestSection[] // sorted by order
}

StudentTestSection {
  id: number
  skill: SkillType
  order: number
  durationMinutes: number | null
}
```

```json
{
  "data": [
    {
      "id": 12,
      "slug": "cambridge-ielts-18-practice-test-1",
      "examType": "IELTS_ACADEMIC",
      "title": "Practice Test 1",
      "source": "Cambridge IELTS 18",
      "durationMinutes": 160,
      "publishedAt": "2026-10-20T08:00:00.000Z",
      "testSections": [
        { "id": 30, "skill": "LISTENING", "order": 1, "durationMinutes": 30 },
        { "id": 31, "skill": "READING", "order": 2, "durationMinutes": 60 }
      ]
    }
  ],
  "meta": { "page": 1, "take": 10, "totalCount": 1 }
}
```

---

## 4. `GET /student/tests/:slug` — test content

Returns everything needed to render a published test. **Answers, explanations, evidence and audio transcripts are never included.**

`:slug` is the `slug` from the catalogue (e.g. `cambridge-ielts-18-practice-test-1`); it does not change once the test is published, so it is safe to put in page URLs.

`404` if the test does not exist or is not published.

**Response `200`**: `StudentTestDetail`

```ts
StudentTestDetail {
  id: number
  slug: string
  examType: ExamType
  title: string
  source: string | null
  durationMinutes: number | null
  publishedAt: string | null
  testSections: StudentTestSectionDetail[]
}

StudentTestSectionDetail {
  id: number
  skill: SkillType
  order: number
  durationMinutes: number | null
  testParts: StudentTestPart[]
}

StudentTestPart {
  id: number
  order: number
  title: string | null                 // e.g. "Part 1"
  instruction: string | null
  audio: StudentMedia | null           // Listening: one audio file for the part
  audioStartMs: number | null          // play range within `audio`
  audioEndMs: number | null
  passage: StudentPassage | null       // IELTS Reading: shared by every group in the part that has no passages of its own
  questionGroups: StudentQuestionGroup[]
}

StudentQuestionGroup {
  id: number
  order: number
  questionType: QuestionType
  instruction: string | null           // e.g. "Write NO MORE THAN TWO WORDS"
  wordLimit: number | null
  content: object | null               // see section 5, "Group content"
  audio: StudentMedia | null
  image: StudentMedia | null           // e.g. a map, plan or diagram
  passages: StudentPassage[]           // TOEIC Part 6/7: the group's own passages; empty for most groups
  questions: StudentQuestion[]
}

StudentQuestion {
  id: number
  numberFrom: number                   // question number shown to the student
  numberTo: number                     // equals numberFrom except for MULTIPLE_CHOICE_MULTI ("Questions 21–22")
  order: number
  prompt: string | null                // the question text
  content: object | null               // see section 5, "Question content"
  audioStartMs: number | null          // seek point in the nearest audio
  audio: StudentMedia | null
  image: StudentMedia | null           // e.g. TOEIC Part 1 photo
}

StudentPassage {
  id: number
  title: string
  subtitle: string | null
  markedBy: MarkedBy                   // how to label paragraphs: A, B, C… / 1, 2, 3… / none
  paragraphs: { id: number; content: string; order: number }[]
}

StudentMedia {
  id: number
  kind: MediaKind
  mimeType: string | null
  durationMs: number | null
  url: string                          // public CDN URL, usable directly in <audio>/<img>
}
```

**Ordering:** sections, parts, groups, passages, paragraphs and questions all come sorted by `order`. Render them in the order received.

**Which passage to show for a group:** use `group.passages` if it is not empty; otherwise use `part.passage`.

**Audio:** audio can be set on a part (IELTS Listening: one file per part, play `audioStartMs`–`audioEndMs`), a group, or a question (e.g. TOEIC Part 1/2). `question.audioStartMs` is the seek point for that question.

---

## 5. Question `content` formats

`questionGroup.content` and `question.content` are JSON whose shape depends on `questionGroup.questionType`. The server validates them on save, so the shapes below are guaranteed. A dash (—) means the content is always `null`.

| questionType                                                                            | group.content                                                      | question.content                                                | Student input                                      |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------- |
| `MULTIPLE_CHOICE`                                                                       | —                                                                  | **choices**                                                     | pick one option                                    |
| `MULTIPLE_CHOICE_MULTI`                                                                 | —                                                                  | **choices**                                                     | pick `numberTo − numberFrom + 1` options           |
| `TRUE_FALSE_NOT_GIVEN`                                                                  | —                                                                  | —                                                               | TRUE / FALSE / NOT GIVEN                           |
| `YES_NO_NOT_GIVEN`                                                                      | —                                                                  | —                                                               | YES / NO / NOT GIVEN                               |
| `MATCHING_HEADINGS`, `MATCHING_FEATURES`, `MATCHING_SENTENCE_ENDINGS`, `CLASSIFICATION` | **matching** (options have text)                                   | —                                                               | pick one key per question                          |
| `MATCHING_INFORMATION`                                                                  | **matching** (keys are paragraph letters; text optional)           | —                                                               | pick one key per question                          |
| `FORM_COMPLETION`, `NOTE_COMPLETION`, `FLOW_CHART_COMPLETION`                           | **template**                                                       | —                                                               | type text into each blank                          |
| `SENTENCE_COMPLETION`                                                                   | template, optional (usually each sentence is in `question.prompt`) | —                                                               | type text                                          |
| `SUMMARY_COMPLETION`                                                                    | **template**, optionally with a word bank in `options`             | —                                                               | type text, or pick a key when `options` is present |
| `TABLE_COMPLETION`                                                                      | **table**                                                          | —                                                               | type text into each blank                          |
| `DIAGRAM_LABELLING`                                                                     | — (diagram is `group.image`)                                       | —                                                               | type text                                          |
| `MAP_LABELLING`, `PLAN_LABELLING`                                                       | **labels** (map/plan is `group.image`)                             | —                                                               | pick a letter                                      |
| `SHORT_ANSWER`                                                                          | —                                                                  | —                                                               | type text                                          |
| `PHOTO_DESCRIPTION`, `QUESTION_RESPONSE` (TOEIC Part 1/2)                               | —                                                                  | **choices without text** (options are only spoken in the audio) | pick one option                                    |
| `TEXT_COMPLETION` (TOEIC Part 6)                                                        | — (passage is in `group.passages`)                                 | **choices**                                                     | pick one option                                    |
| `RESPOND_USING_INFO`                                                                    | **info**                                                           | timing, optional                                                | speak                                              |
| `READ_ALOUD`, `DESCRIBE_PICTURE`, `RESPOND_TO_QUESTIONS`, `EXPRESS_OPINION`             | —                                                                  | timing, optional                                                | speak                                              |
| `WRITE_SENTENCE_PICTURE`, `RESPOND_WRITTEN_REQUEST`, `OPINION_ESSAY`                    | —                                                                  | timing, optional                                                | write                                              |

**Bold** means the content is always present for that type.

### Group content

```jsonc
// matching: allowReuse (optional) means one option may be used for several questions
{ "options": [{ "key": "i", "text": "The history of the region" },
              { "key": "ii", "text": "A new approach to farming" }],
  "allowReuse": false }

// template: {{n}} marks the blank for question number n
{ "template": "Name: Sarah {{1}}\nPostcode: {{2}}" }

// template with a word bank (SUMMARY_COMPLETION)
{ "template": "The study found {{14}} in ...",
  "options": [{ "key": "A", "text": "rapid growth" }, { "key": "B", "text": "decline" }] }

// table: headers optional; cells may contain {{n}}
{ "table": { "headers": ["Event", "Date"],
             "rows": [["Opening", "{{5}}"], ["{{6}}", "June 3"]] } }

// labels (MAP/PLAN_LABELLING): letters shown on the image
{ "options": [{ "key": "A" }, { "key": "B" }, { "key": "C" }] }

// info (TOEIC Speaking Q8–10): title optional
{ "info": { "title": "Conference Schedule",
            "rows": [["9:00", "Keynote"], ["10:30", "Workshop"]] } }
```

### Question content

```jsonc
// choices
{ "options": [{ "key": "A", "text": "at the station" }, { "key": "B", "text": "in the office" }] }

// choices without text (TOEIC Part 1/2)
{ "options": [{ "key": "A" }, { "key": "B" }, { "key": "C" }] }

// timing (Speaking/Writing): both fields optional
{ "prepSeconds": 45, "responseSeconds": 45 }
```

### Rules you can rely on

- `options` always has at least 2 items, and keys are unique within the list.
- Each `{{n}}` placeholder appears at most once in a template or table. `n` is meant to equal a question's `numberFrom` in the same group, but the server doesn't enforce this yet, so handle a blank with no matching question gracefully.
- Placeholders always have the form `{{n}}`. Parse them with `/\{\{\s*(\d+)\s*\}\}/g`.
- No other fields appear besides those listed above.

---

## 6. Enums

```ts
type ExamType = 'IELTS_ACADEMIC' | 'IELTS_GENERAL' | 'TOEIC_LR' | 'TOEIC_SW';

type SkillType = 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';

type MarkedBy = 'ALPHABET' | 'NUMBER' | 'NONE';

type MediaKind = 'AUDIO' | 'IMAGE';

type QuestionType =
  // IELTS
  | 'MULTIPLE_CHOICE'
  | 'MULTIPLE_CHOICE_MULTI'
  | 'TRUE_FALSE_NOT_GIVEN'
  | 'YES_NO_NOT_GIVEN'
  | 'MATCHING_HEADINGS'
  | 'MATCHING_INFORMATION'
  | 'MATCHING_FEATURES'
  | 'MATCHING_SENTENCE_ENDINGS'
  | 'CLASSIFICATION'
  | 'FORM_COMPLETION'
  | 'SENTENCE_COMPLETION'
  | 'SUMMARY_COMPLETION'
  | 'NOTE_COMPLETION'
  | 'TABLE_COMPLETION'
  | 'FLOW_CHART_COMPLETION'
  | 'DIAGRAM_LABELLING'
  | 'MAP_LABELLING'
  | 'PLAN_LABELLING'
  | 'SHORT_ANSWER'
  // TOEIC Listening & Reading
  | 'PHOTO_DESCRIPTION'
  | 'QUESTION_RESPONSE'
  | 'TEXT_COMPLETION'
  // TOEIC Speaking & Writing
  | 'READ_ALOUD'
  | 'DESCRIBE_PICTURE'
  | 'RESPOND_TO_QUESTIONS'
  | 'RESPOND_USING_INFO'
  | 'EXPRESS_OPINION'
  | 'WRITE_SENTENCE_PICTURE'
  | 'RESPOND_WRITTEN_REQUEST'
  | 'OPINION_ESSAY';
```

Exam types and their skills:

| ExamType                          | Skills                                |
| --------------------------------- | ------------------------------------- |
| `IELTS_ACADEMIC`, `IELTS_GENERAL` | LISTENING, READING, WRITING, SPEAKING |
| `TOEIC_LR`                        | LISTENING, READING                    |
| `TOEIC_SW`                        | SPEAKING, WRITING                     |
