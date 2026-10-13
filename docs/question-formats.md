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
- `key`/`keys` phải nằm trong danh sách option tương ứng (cột "option lấy từ" bên dưới). Dạng có word bank mà group chưa có `options` thì chỉ nhận `accepted`.
- Đổi `questionType` hoặc `content` của một group thì validate lại `content`/`answer` của tất cả câu trong group (vd bỏ một option đang là đáp án sẽ bị 400).

## Bảng tổng hợp

| question_type                                                   | group.content                                                   | question.content         | answer                                        | option lấy từ                |
| --------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------ | --------------------------------------------- | ---------------------------- |
| MULTIPLE_CHOICE                                                 | —                                                               | **options** (có text)    | `key`                                         | question.content             |
| MULTIPLE_CHOICE_MULTI                                           | —                                                               | **options** (có text)    | `keys` (số key = number_to − number_from + 1) | question.content             |
| TRUE_FALSE_NOT_GIVEN                                            | —                                                               | —                        | `key`                                         | `TRUE`, `FALSE`, `NOT GIVEN` |
| YES_NO_NOT_GIVEN                                                | —                                                               | —                        | `key`                                         | `YES`, `NO`, `NOT GIVEN`     |
| MATCHING_HEADINGS / FEATURES / SENTENCE_ENDINGS, CLASSIFICATION | **matching** (option có text)                                   | —                        | `key`                                         | group.content                |
| MATCHING_INFORMATION                                            | **matching** (text tuỳ chọn, key là chữ cái đoạn văn)           | —                        | `key`                                         | group.content                |
| FORM / FLOW_CHART_COMPLETION                                    | **template**                                                    | —                        | `accepted`                                    |                              |
| NOTE / SUMMARY_COMPLETION                                       | **template** + options tuỳ chọn (word bank)                     | —                        | `accepted`, hoặc `key` nếu có word bank       | group.content                |
| SENTENCE_COMPLETION                                             | template và/hoặc options (word bank); mỗi câu thường ở `prompt` | —                        | `accepted`, hoặc `key` nếu có word bank       | group.content                |
| TABLE_COMPLETION                                                | **table**                                                       | —                        | `accepted`                                    |                              |
| DIAGRAM_LABELLING                                               | — (ảnh ở `image_media_id`)                                      | —                        | `accepted`                                    |                              |
| MAP_LABELLING, PLAN_LABELLING                                   | **labels**                                                      | —                        | `key`                                         | group.content                |
| SHORT_ANSWER                                                    | —                                                               | —                        | `accepted`                                    |                              |
| PHOTO_DESCRIPTION, QUESTION_RESPONSE (TOEIC Part 1/2)           | —                                                               | **options** (không text) | `key`                                         | question.content             |
| TEXT_COMPLETION (TOEIC Part 6)                                  | — (passage gắn qua `group_passages`)                            | **options** (có text)    | `key`                                         | question.content             |
| RESPOND_USING_INFO                                              | **info**                                                        | timing (tuỳ chọn)        | `sample`                                      |                              |
| 7 dạng Speaking/Writing còn lại                                 | —                                                               | timing (tuỳ chọn)        | `sample`                                      |                              |

**In đậm** = bắt buộc.

## group.content

```jsonc
// matching
{ "options": [{ "key": "i", "text": "The history of the region" },
              { "key": "ii", "text": "A new approach to farming" }],
  "allowReuse": false }          // allowReuse tuỳ chọn: một option dùng cho nhiều câu

// template: cần ít nhất một {{n}}
{ "template": "Name: Sarah {{1}}\nPostcode: {{2}}" }

// note / summary / sentence có word bank ("Choose from the box"); sentence có thể chỉ có options
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

## Kiểm tra lúc publish

`PATCH /tests/:id` với `status: PUBLISHED` chạy `src/modules/tests/test-publish.validator.ts` trên cả cây đề và trả 400 kèm **toàn bộ** lỗi tìm được (`message` là mảng). Các check:

- Test có section, section có part, part có group, group có câu hỏi.
- Đánh số mỗi section liên tục, không trùng (tính cả dải `number_from..number_to`). IELTS Listening/Reading phải đủ 1–40, TOEIC LR Listening 1–100 / Reading 101–200, TOEIC SW Speaking 1–11 / Writing 1–8.
- Placeholder `{{n}}` trong template/table khớp đúng tập `number_from` của các câu trong group.
- Group có word bank thì mọi câu phải là `key`.
- IELTS: mỗi section cần `duration_minutes`; part Listening cần audio; group Reading cần passage và các group trong một part phải gắn cùng passage. TOEIC LR: test cần `duration_minutes`. TEXT_COMPLETION cần passage.
- Passage được gắn chưa bị xoá; DIAGRAM/MAP/PLAN_LABELLING có `image_media_id`.
- Chạy lại các check lúc lưu (shape + key thuộc options) để bắt dữ liệu cũ.
