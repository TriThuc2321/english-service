# JSON formats by question type

These formats apply to the `question_groups.content`, `questions.content`, `questions.answer` and `questions.evidence` columns. The service validates them on every save:

- `src/modules/questions/question-answer.ts` validates `answer`.
- `src/modules/questions/question-content.ts` validates `content` and `evidence`.

Update this file whenever a format changes.

General rules:

- Fields that aren't part of the format are rejected.
- `options` needs at least 2 items, with unique `key`s.
- "—" means the question type **accepts no** content: sending some returns 400, so leave it `null` or empty.
- `{{n}}` placeholders must be well-formed and not repeat a number. Matching `n` against `questions.number_from` isn't checked on save; it is checked on publish.
- Changing a group's `questionType` re-validates the group's `content` along with the `content`/`answer` of every question in the group.

## Summary

| question_type                                                   | group.content                                             | question.content        | answer                                           |
| --------------------------------------------------------------- | --------------------------------------------------------- | ----------------------- | ------------------------------------------------ |
| MULTIPLE_CHOICE                                                 | —                                                         | **options** (with text) | `key`                                            |
| MULTIPLE_CHOICE_MULTI                                           | —                                                         | **options** (with text) | `keys` (key count = number_to − number_from + 1) |
| TRUE_FALSE_NOT_GIVEN, YES_NO_NOT_GIVEN                          | —                                                         | —                       | `key`                                            |
| MATCHING_HEADINGS / FEATURES / SENTENCE_ENDINGS, CLASSIFICATION | **matching** (options with text)                          | —                       | `key`                                            |
| MATCHING_INFORMATION                                            | **matching** (text optional, keys are paragraph letters)  | —                       | `key`                                            |
| FORM / NOTE / FLOW_CHART_COMPLETION                             | **template**                                              | —                       | `accepted`                                       |
| SENTENCE_COMPLETION                                             | template (optional, usually each sentence is in `prompt`) | —                       | `accepted`                                       |
| SUMMARY_COMPLETION                                              | **template** + optional options (word bank)               | —                       | `accepted` or `key`                              |
| TABLE_COMPLETION                                                | **table**                                                 | —                       | `accepted`                                       |
| DIAGRAM_LABELLING                                               | — (image in `image_media_id`)                             | —                       | `accepted`                                       |
| MAP_LABELLING, PLAN_LABELLING                                   | **labels**                                                | —                       | `key`                                            |
| SHORT_ANSWER                                                    | —                                                         | —                       | `accepted`                                       |
| PHOTO_DESCRIPTION, QUESTION_RESPONSE (TOEIC Part 1/2)           | —                                                         | **options** (no text)   | `key`                                            |
| TEXT_COMPLETION (TOEIC Part 6)                                  | — (passage attached through `group_passages`)             | **options** (with text) | `key`                                            |
| RESPOND_USING_INFO                                              | **info**                                                  | timing (optional)       | `sample`                                         |
| The other 7 Speaking/Writing types                              | —                                                         | timing (optional)       | `sample`                                         |
| IELTS_WRITING_TASK_1, IELTS_WRITING_TASK_2                      | —                                                         | timing (optional)       | `sample`                                         |
| IELTS_SPEAKING_PART_1 / 2 / 3                                   | —                                                         | timing (optional)       | `sample`                                         |

**Bold** = required.

TRUE_FALSE_NOT_GIVEN only accepts the keys `TRUE`, `FALSE`, `NOT GIVEN`; YES_NO_NOT_GIVEN only accepts `YES`, `NO`, `NOT GIVEN` (upper case, with the space).

## group.content

```jsonc
// matching
{ "options": [{ "key": "i", "text": "The history of the region" },
              { "key": "ii", "text": "A new approach to farming" }],
  "allowReuse": false }          // allowReuse is optional: one option can answer several questions

// template: needs at least one {{n}}
{ "template": "Name: Sarah {{1}}\nPostcode: {{2}}" }

// summary (with a word bank)
{ "template": "The study found {{14}} in ...",
  "options": [{ "key": "A", "text": "rapid growth" }, { "key": "B", "text": "decline" }] }

// table: headers are optional, the table needs at least one {{n}}
{ "table": { "headers": ["Event", "Date"],
             "rows": [["Opening", "{{5}}"], ["{{6}}", "June 3"]] } }

// labels (map/plan): the letters on the image
{ "options": [{ "key": "A" }, { "key": "B" }, { "key": "C" }] }

// info (TOEIC Speaking Q8-10): title is optional
{ "info": { "title": "Conference Schedule", "rows": [["9:00", "Keynote"], ["10:30", "Workshop"]] } }
```

## question.content

```jsonc
// options with text (MCQ, TOEIC Part 3-7)
{ "options": [{ "key": "A", "text": "at the station" }, { "key": "B", "text": "in the office" }] }

// options without text (TOEIC Part 1/2: the choices are only in the audio)
{ "options": [{ "key": "A" }, { "key": "B" }, { "key": "C" }] }

// timing (Speaking/Writing): both fields are optional
{ "prepSeconds": 45, "responseSeconds": 45 }
```

## answer

```jsonc
{ "key": "B" }                              // a single answer
{ "keys": ["A", "D"] }                      // Choose TWO: each key graded separately, order doesn't matter
{ "accepted": ["colour", "color"] }         // gap fill: matched after normalising + applying word_limit
{ "sample": "...", "rubric": { "TA": "..." } } // Speaking/Writing: model answer + criteria (rubric optional)
```

`sample`/`rubric` are for teachers only and appear in `/result`. For IELTS Speaking, the student's answer is a recording (not a `response` sent through autosave); `timing` is for display only, and the server doesn't enforce the recording length.

Only `keys` may span a range of numbers (`number_to > number_from`). Every other shape needs `number_to = number_from`.

Answers are also checked against the question/group content (when a question is created or edited, and when a group's `question_type`/`content`/`word_limit` changes):

- `key`/`keys` must be in the question's `options` if it has any, otherwise in the group's. TFNG/YNNG use the fixed keys `TRUE`/`FALSE`/`NOT GIVEN` and `YES`/`NO`/`NOT GIVEN`.
- SUMMARY_COMPLETION: if the group has `options` (a word bank) the answer is a `key`, otherwise `accepted`. Switching between the two means deleting the questions and creating them again.
- Each `accepted` value must be non-empty after normalising and must not exceed `word_limit`.

## evidence

```json
{ "paragraphId": 12, "quote": "..." }
```

At least one of the two fields is required.
