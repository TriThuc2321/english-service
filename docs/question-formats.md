# Format JSON theo dạng câu hỏi

Áp dụng cho các cột `question_groups.content`, `questions.content`, `questions.answer` và `questions.evidence`.
Service validate các format này mỗi lần lưu:

- `src/modules/questions/question-answer.ts`: validate `answer`.
- `src/modules/questions/question-content.ts`: validate `content` và `evidence`.

Khi sửa format thì cập nhật file này cùng lúc.

Quy tắc chung:

- Field không có trong format sẽ bị từ chối.
- `options` cần ít nhất 2 phần tử, `key` không trùng nhau.
- "—" nghĩa là dạng câu hỏi đó **không nhận** content: gửi lên sẽ bị 400, nên để `null` hoặc bỏ trống.
- Placeholder `{{n}}` phải đúng cú pháp và không trùng số. Việc khớp `n` với `questions.number_from` chưa check lúc lưu mà để đến lúc publish.
- Đổi `questionType` của một group thì validate lại `content` của group cùng `content`/`answer` của tất cả câu trong group.

## Bảng tổng hợp

| question_type                                                   | group.content                                         | question.content         | answer                                        |
| --------------------------------------------------------------- | ----------------------------------------------------- | ------------------------ | --------------------------------------------- |
| MULTIPLE_CHOICE                                                 | —                                                     | **options** (có text)    | `key`                                         |
| MULTIPLE_CHOICE_MULTI                                           | —                                                     | **options** (có text)    | `keys` (số key = number_to − number_from + 1) |
| TRUE_FALSE_NOT_GIVEN, YES_NO_NOT_GIVEN                          | —                                                     | —                        | `key`                                         |
| MATCHING_HEADINGS / FEATURES / SENTENCE_ENDINGS, CLASSIFICATION | **matching** (option có text)                         | —                        | `key`                                         |
| MATCHING_INFORMATION                                            | **matching** (text tuỳ chọn, key là chữ cái đoạn văn) | —                        | `key`                                         |
| FORM / NOTE / FLOW_CHART_COMPLETION                             | **template**                                          | —                        | `accepted`                                    |
| SENTENCE_COMPLETION                                             | template (tuỳ chọn, thường mỗi câu nằm ở `prompt`)    | —                        | `accepted`                                    |
| SUMMARY_COMPLETION                                              | **template** + options tuỳ chọn (word bank)           | —                        | `accepted` hoặc `key`                         |
| TABLE_COMPLETION                                                | **table**                                             | —                        | `accepted`                                    |
| DIAGRAM_LABELLING                                               | — (ảnh ở `image_media_id`)                            | —                        | `accepted`                                    |
| MAP_LABELLING, PLAN_LABELLING                                   | **labels**                                            | —                        | `key`                                         |
| SHORT_ANSWER                                                    | —                                                     | —                        | `accepted`                                    |
| PHOTO_DESCRIPTION, QUESTION_RESPONSE (TOEIC Part 1/2)           | —                                                     | **options** (không text) | `key`                                         |
| TEXT_COMPLETION (TOEIC Part 6)                                  | — (passage gắn qua `group_passages`)                  | **options** (có text)    | `key`                                         |
| RESPOND_USING_INFO                                              | **info**                                              | timing (tuỳ chọn)        | `sample`                                      |
| 7 dạng Speaking/Writing còn lại                                 | —                                                     | timing (tuỳ chọn)        | `sample`                                      |

**In đậm** = bắt buộc.

## group.content

```jsonc
// matching
{ "options": [{ "key": "i", "text": "The history of the region" },
              { "key": "ii", "text": "A new approach to farming" }],
  "allowReuse": false }          // allowReuse tuỳ chọn: một option dùng cho nhiều câu

// template: cần ít nhất một {{n}}
{ "template": "Name: Sarah {{1}}\nPostcode: {{2}}" }

// summary (có word bank)
{ "template": "The study found {{14}} in ...",
  "options": [{ "key": "A", "text": "rapid growth" }, { "key": "B", "text": "decline" }] }

// table: headers tuỳ chọn, cả bảng cần ít nhất một {{n}}
{ "table": { "headers": ["Event", "Date"],
             "rows": [["Opening", "{{5}}"], ["{{6}}", "June 3"]] } }

// labels (map/plan): chữ cái trên ảnh
{ "options": [{ "key": "A" }, { "key": "B" }, { "key": "C" }] }

// info (TOEIC Speaking Q8-10): title tuỳ chọn
{ "info": { "title": "Conference Schedule", "rows": [["9:00", "Keynote"], ["10:30", "Workshop"]] } }
```

## question.content

```jsonc
// options có text (MCQ, TOEIC Part 3-7)
{ "options": [{ "key": "A", "text": "at the station" }, { "key": "B", "text": "in the office" }] }

// options không text (TOEIC Part 1/2: lựa chọn chỉ có trong audio)
{ "options": [{ "key": "A" }, { "key": "B" }, { "key": "C" }] }

// timing (Speaking/Writing): cả hai field đều tuỳ chọn
{ "prepSeconds": 45, "responseSeconds": 45 }
```

## answer

```jsonc
{ "key": "B" }                              // một đáp án
{ "keys": ["A", "D"] }                      // Choose TWO: chấm từng key, không xét thứ tự
{ "accepted": ["colour", "color"] }         // điền từ: so khớp sau khi normalize + áp word_limit
{ "sample": "...", "rubric": { "TA": "..." } } // Speaking/Writing: bài mẫu + tiêu chí (rubric tuỳ chọn)
```

Chỉ `keys` được dùng một dải số (`number_to > number_from`). Các shape khác phải có `number_to = number_from`.

## evidence

```json
{ "paragraphId": 12, "quote": "..." }
```

Cần ít nhất một trong hai field.
