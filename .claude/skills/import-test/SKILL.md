---
name: import-test
description: Turn an IELTS or TOEIC test (a PDF or page images, plus its answer key) into a validated import JSON for this repo's POST /tests/import, with bilingual EN/VI explanations and passage evidence for every question. Use this whenever the user wants to import, digitise, nhập, tạo đề or "đưa đề vào hệ thống" from a PDF, scan, screenshot or answer-key image, even if they only point at a folder of "Đề thi" / "Đáp án" files, mention Cambridge IELTS or ETS TOEIC tests, or ask to add explanations (giải thích) to a test. It produces the JSON file only and does not call the API.
---

# Import a test from a PDF

The goal is one JSON file per test that `POST /api/tests/import` accepts on the first try. Every question should carry the answer from the key, evidence quoted from the passage, and a short EN/VI explanation. The user reviews it and imports it through Swagger or the BO themselves, so **don't call the API**. It creates data in a shared environment, and the user has chosen to do that step manually.

The import format and its rules already live in the repo, so read them rather than guessing:

- `src/modules/test-import/test-import.type.ts`: the JSON shape (`ITestImport`)
- `docs/question-formats.md`: `content` / `answer` per question type
- `references/mapping.md` (in this skill): how printed IELTS/TOEIC tasks map onto that shape. Read it before writing any JSON.
- `references/explanations.md` (in this skill): how to write explanations. Read it before step 5.

## Workflow

### 1. Find the inputs

You need the test and its answer key. Collections usually pair them by name, e.g. `Đề Reading/1 - Đề thi IELTS Reading.pdf` and `Đáp án/1 - Đề thi IELTS Reading - Đáp án.png`. If there is no key, ask the user for it. Don't solve the test yourself and present the result as the key: students will be graded against these answers. When the user asks for several tests, handle them one at a time and write one file per test.

### 2. Render the pages

```bash
.claude/skills/import-test/scripts/render_pdf.sh "<test.pdf>" "<scratch dir>/pages"
```

The script writes `p01.png …` and `text.txt`, and prints whether the PDF is scanned. Collected PDFs are almost always scans, so the PNGs are the source. Read every page with the Read tool, including the answer key image. If small print is hard to read, re-render that PDF at a higher dpi (third argument, e.g. `160`). Put the pages in a scratch or temp directory, never in the repo.

### 3. Transcribe into JSON

Build the document part by part: passage first, then its question groups. Follow `references/mapping.md`. These are the details that most often go wrong:

- paragraph count and labels (`markedBy`, with sub-paragraphs joined under one letter)
- "Choose TWO" becomes **one** question spanning two numbers
- the word limit goes on the group, and `{{n}}` placeholders must match the question numbers exactly
- passage text is copied verbatim, because answers and quotes are checked against it

Write the file next to the source PDF as `<pdf name without extension>.import.json`, unless the user names another place. Don't put it in the repo: the test content is copyrighted, and the repo only holds code.

### 4. Validate

```bash
.claude/skills/import-test/scripts/validate.sh "<file>.import.json"
```

This runs the repo's own `validateTestImport`, the same check the endpoint does, and prints one line per section: question count, questions without explanation, questions without evidence. Then it lists every issue.

- **error**: the endpoint would reject the file. Fix it and validate again until there are no errors.
- **warning `answer "x" … is not in the passage`**: usually a transcription mistake in the passage or the answer. Look at the page image again before deciding. If the key really uses a word that isn't in the text, keep it and mention it in the report.
- **evidence quote not found**: the quote wasn't copied exactly. Copy it again from your passage text.

The section count should match the paper (40 for IELTS Reading; 100 per section for TOEIC LR) before you move on.

### 5. Add explanations and evidence

Follow `references/explanations.md`. Give every question an `explanation` with `EN:` and `VI:` lines, and an `evidence` quote (NOT GIVEN answers have none). Work through one group at a time, re-reading the passage for each answer instead of relying on memory. When you can't justify the key from the text, leave that question without an explanation and flag it. Then run `validate.sh` again: the "without explanation" list should contain only the questions you deliberately skipped.

### 6. Report

Finish with a short report in the user's language:

- the output path, plus question count per section and the validator result (errors / warnings)
- questions flagged for review: key seems to contradict the passage, explanation skipped, unreadable page
- content the schema couldn't hold (footnotes, images, audio), so the user can add it in the BO
- how to import: `POST /api/tests/import` with the file as the body (Swagger "Tests" → `TestImport_import`, using a BO token with CREATE on Test and Passage). The test is created as DRAFT, and passages as new DRAFT passages.
