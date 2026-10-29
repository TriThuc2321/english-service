# Paper → import JSON mapping

The JSON shape is `ITestImport` (`src/modules/test-import/test-import.type.ts`).
The per-type `content` / `answer` rules live in `docs/question-formats.md`.
Read that file once. It is short and it is the source of truth, and the validator
enforces it. This file covers what the docs don't: how a printed test maps onto
that shape.

## Contents

1. Test / section / part
2. Passages
3. Question groups, IELTS
4. Question groups, TOEIC
5. Answer keys
6. Evidence
7. Things the schema can't hold

## 1. Test / section / part

- Each skill gets its own section (`READING`, `LISTENING`, …). Question numbers restart at 1 in every section.
- IELTS Reading: one section with 3 parts, one per passage. Use `durationMinutes: 60` on the test and the section.
- Part `title`: `"Reading Passage 1"`. Part `instruction`: the "You should spend about 20 minutes on Questions 1–13…" line.
- `examType`: `IELTS_ACADEMIC` unless the paper says General Training (GT reading has short notices or ads in Section 1). If you can't tell, say so in the report.
- `title`: name it after the source, e.g. `"IELTS Reading – Test 1"`. `source`: the PDF file name or book name. Omit `slug` and the server generates one.

## 2. Passages

- `markedBy: "ALPHABET"` when the paper labels paragraphs A, B, C…. Use `"NONE"` otherwise. Don't type the label into the text, because the app renders it from `markedBy`.
- Make one `paragraphs[]` item per **label**. When a labelled section has several printed paragraphs (common in IELTS: "A … / … / …"), join them with a blank line (`\n\n`). Matching-information answers depend on the count of items equalling the count of letters.
- Unlabelled passages get one item per printed paragraph. Two-column layouts read down the left column, then the right. A paragraph that continues across a page or column break is still one item.
- Keep the passage's punctuation: curly quotes, en dashes, `£`, `CO₂`. Rejoin words hyphenated at a line break ("eye-\nrolling" → "eye-rolling" only if the hyphen is real; "accom-\nmodation" → "accommodation").
- Drop footnote markers (`amphitheatre*` → `amphitheatre`), and list the footnotes in the report. See §7.
- `subtitle`: the standfirst or byline under the title, if there is one.

## 3. Question groups, IELTS

One group per printed "Questions X–Y" block. `instruction` = the block's instruction lines joined with `\n`, including the TRUE/FALSE/NOT GIVEN legend.

| Printed task                              | questionType                | Where things go                                                                                                                                               |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TRUE / FALSE / NOT GIVEN                  | `TRUE_FALSE_NOT_GIVEN`      | statement → `prompt`; answer `{"key":"NOT GIVEN"}` (upper case, with a space)                                                                                 |
| YES / NO / NOT GIVEN                      | `YES_NO_NOT_GIVEN`          | same                                                                                                                                                          |
| Which paragraph contains… (A–G)           | `MATCHING_INFORMATION`      | group `content.options` = `[{"key":"A"},…]`, one per paragraph; `"allowReuse": true` when it says "NB You may use any letter more than once"; item → `prompt` |
| Match headings (i–x)                      | `MATCHING_HEADINGS`         | options with `text` = heading; `prompt` = "Paragraph B"                                                                                                       |
| Match features / people (A–E)             | `MATCHING_FEATURES`         | options with text; statement → `prompt`                                                                                                                       |
| Match sentence endings                    | `MATCHING_SENTENCE_ENDINGS` | endings → options; sentence start → `prompt`                                                                                                                  |
| Classify (A / B / C)                      | `CLASSIFICATION`            | categories → options                                                                                                                                          |
| Choose the correct letter A–D             | `MULTIPLE_CHOICE`           | stem → `prompt`; question `content.options` with text                                                                                                         |
| Choose TWO / THREE letters                | `MULTIPLE_CHOICE_MULTI`     | **one** question, `numberFrom: 23, numberTo: 24`; answer `{"keys":["C","D"]}`                                                                                 |
| Complete the notes                        | `NOTE_COMPLETION`           | whole box → `content.template`, each gap → `{{n}}`                                                                                                            |
| Complete the summary (words from passage) | `SUMMARY_COMPLETION`        | template; answers `accepted`                                                                                                                                  |
| Complete the summary using the list A–J   | `SUMMARY_COMPLETION`        | template **plus** `content.options` (word bank); answers `{"key":"H"}`                                                                                        |
| Complete the sentences                    | `SENTENCE_COMPLETION`       | each sentence → `prompt`, with the gap written as `{{n}}` inside it, no template                                                                              |
| Complete the table                        | `TABLE_COMPLETION`          | `content.table` `{headers, rows}`; gaps `{{n}}` in cells                                                                                                      |
| Flow chart                                | `FLOW_CHART_COMPLETION`     | template, one step per line, `→` between steps                                                                                                                |
| Label the diagram                         | `DIAGRAM_LABELLING`         | no content; image attached later in the BO (see §7)                                                                                                           |
| Short answer questions                    | `SHORT_ANSWER`              | question → `prompt`; answer `accepted`                                                                                                                        |

Word limits: "ONE WORD ONLY" → `wordLimit: 1`, "NO MORE THAN TWO WORDS" → 2, "ONE WORD AND/OR A NUMBER" → 2. Every `accepted` value has to fit within the limit.

Templates are plain text. Put the box title on the first line, then a blank line. Subheadings get a line of their own. Bullets start with `• `. Gaps are `{{n}}`, without the printed dotted line or the bold number. Example (Test 1, Q1–6):

```
The London underground railway

The problem
• The {{1}} of London increased rapidly between 1800 and 1850
• The streets were full of horse-drawn vehicles
```

## 4. Question groups, TOEIC

| Part                      | questionType        | Notes                                                                                                 |
| ------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| 1 Photographs             | `PHOTO_DESCRIPTION` | options `[{"key":"A"},…{"key":"D"}]` with no text (the choices are only in the audio)                 |
| 2 Question–response       | `QUESTION_RESPONSE` | options A–C, no text                                                                                  |
| 3–4 Conversations / talks | `MULTIPLE_CHOICE`   | each question → prompt + options with text; one group per conversation                                |
| 5 Incomplete sentences    | `MULTIPLE_CHOICE`   | sentence with `-------` → prompt; no passage                                                          |
| 6 Text completion         | `TEXT_COMPLETION`   | passage = the text, gaps left as printed; options per question                                        |
| 7 Reading comprehension   | `MULTIPLE_CHOICE`   | one part per document set, with the documents as the passage (several documents → one paragraph each) |

Audio and photos can't be imported yet (see §7). Import the structure anyway; media is attached in the BO afterwards.

## 5. Answer keys

- The key is authoritative. Don't "correct" it. If the passage seems to disagree, keep the key and flag the question number in the report.
- `23&24 IN EITHER ORDER C D` → one `MULTIPLE_CHOICE_MULTI` question 23–24 with `keys: ["C","D"]`.
- Alternatives in the key go into `accepted`: `colour / color` → `["colour","color"]`, and `(the) harbour` → `["harbour","the harbour"]`. Words in brackets are optional, so list both forms.
- Answer keys sometimes show TRUE/FALSE as `T`/`F`. Expand them to the full upper-case word.

## 6. Evidence

`evidence: { "paragraph": <1-based index into this part's paragraphs>, "quote": "<verbatim>" }`

- Copy the quote **verbatim** from that paragraph. Keep it short: the clause that proves the answer, ideally under 25 words. The validator rejects quotes it can't find, and it catches copying mistakes this way.
- For a NOT GIVEN answer, leave `evidence` out: there is nothing to quote.
- When a question is about a whole paragraph ("main purpose of the first paragraph"), `{"paragraph": 1}` alone is fine.
- For "Choose TWO" questions, pick the quote for the first key and give the second key's evidence in the explanation.

## 7. Things the schema can't hold

List these in the report rather than forcing them in:

- footnotes / glossaries under a passage
- images: diagrams, maps, TOEIC photos (they get `imageMediaId` in the BO later)
- audio and listening transcripts
- example answers printed in the question block ("Example: 0 … B"). Leave the example out of the questions, but you may keep it in the group `instruction`.
