import { BadRequestException } from '@nestjs/common';

import { QuestionType } from '../../types/test.type.js';
import {
  assertOnlyFields,
  type Fail,
  isNonEmptyString,
  isPlainObject,
} from './json-shape.js';

// Formats are documented in docs/question-formats.md; keep them in sync
interface IContentRule {
  required: boolean;
  example: string;
  validate: (content: Record<string, unknown>, fail: Fail) => void;
}

type Content = Record<string, unknown> | null | undefined;

const PLACEHOLDER = /\{\{\s*(\d+)\s*\}\}/g;

function assertOptions(value: unknown, requireText: boolean, fail: Fail) {
  if (!Array.isArray(value) || value.length < 2) {
    fail('options must be an array of at least 2 items');
  }
  const keys = new Set<string>();
  for (const option of value as unknown[]) {
    if (!isPlainObject(option) || !isNonEmptyString(option.key)) {
      fail('each option needs a non-empty key');
    }
    const { key, text } = option as Record<string, unknown>;
    assertOnlyFields(option as Record<string, unknown>, ['key', 'text'], fail);
    if (
      requireText
        ? !isNonEmptyString(text)
        : text !== undefined && typeof text !== 'string'
    ) {
      fail(
        `option ${String(key)} needs ${requireText ? 'a non-empty' : 'a string'} text`,
      );
    }
    if (keys.has(key as string)) {
      fail(`duplicate option key ${String(key)}`);
    }
    keys.add(key as string);
  }
}

function collectPlaceholders(text: string, fail: Fail) {
  const numbers = [...text.matchAll(PLACEHOLDER)].map((m) => Number(m[1]));
  if ((text.match(/\{\{/g) ?? []).length !== numbers.length) {
    fail('placeholders must look like {{12}}');
  }
  return numbers;
}

function assertPlaceholders(numbers: number[], fail: Fail) {
  if (!numbers.length) {
    fail('needs at least one {{n}} placeholder');
  }
  const duplicate = numbers.find((n, i) => numbers.indexOf(n) !== i);
  if (duplicate !== undefined) {
    fail(`placeholder {{${duplicate}}} appears more than once`);
  }
}

function assertTemplate(value: unknown, fail: Fail) {
  if (!isNonEmptyString(value)) {
    fail('template must be a non-empty string');
  }
  assertPlaceholders(collectPlaceholders(value as string, fail), fail);
}

function assertRows(value: unknown, label: string, fail: Fail) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    !value.every(
      (row) =>
        Array.isArray(row) &&
        row.length > 0 &&
        row.every((cell) => typeof cell === 'string'),
    )
  ) {
    fail(`${label} must be a non-empty array of non-empty string arrays`);
  }
  return value as string[][];
}

function assertOptionalStrings(value: unknown, label: string, fail: Fail) {
  if (
    value !== undefined &&
    (!Array.isArray(value) || !value.every((v) => typeof v === 'string'))
  ) {
    fail(`${label} must be an array of strings`);
  }
}

const matching = (requireText: boolean): IContentRule => ({
  required: true,
  example: `{"options":[{"key":"i"${requireText ? ',"text":"..."' : ''}}],"allowReuse":false}`,
  validate: (c, fail) => {
    assertOnlyFields(c, ['options', 'allowReuse'], fail);
    assertOptions(c.options, requireText, fail);
    if (c.allowReuse !== undefined && typeof c.allowReuse !== 'boolean') {
      fail('allowReuse must be a boolean');
    }
  },
});

const template: IContentRule = {
  required: true,
  example: '{"template":"Name: Sarah {{1}}"}',
  validate: (c, fail) => {
    assertOnlyFields(c, ['template'], fail);
    assertTemplate(c.template, fail);
  },
};

// Completion with an optional word bank ("Choose from the box")
const completion = (requireTemplate: boolean): IContentRule => ({
  required: requireTemplate,
  example: requireTemplate
    ? '{"template":"... {{14}} ...","options":[{"key":"A","text":"..."}]}'
    : '{"template":"... {{14}} ..."} or {"options":[{"key":"A","text":"..."}]}',
  validate: (c, fail) => {
    assertOnlyFields(c, ['template', 'options'], fail);
    if (requireTemplate || c.template !== undefined) {
      assertTemplate(c.template, fail);
    }
    if (c.options !== undefined) {
      assertOptions(c.options, true, fail);
    } else if (c.template === undefined) {
      fail('needs a template and/or options');
    }
  },
});

const labels: IContentRule = {
  required: true,
  example: '{"options":[{"key":"A"},{"key":"B"}]}',
  validate: (c, fail) => {
    assertOnlyFields(c, ['options'], fail);
    assertOptions(c.options, false, fail);
  },
};

const choices = (requireText: boolean): IContentRule => ({
  required: true,
  example: requireText
    ? '{"options":[{"key":"A","text":"..."},{"key":"B","text":"..."}]}'
    : '{"options":[{"key":"A"},{"key":"B"},{"key":"C"}]}',
  validate: (c, fail) => {
    assertOnlyFields(c, ['options'], fail);
    assertOptions(c.options, requireText, fail);
  },
});

const timing: IContentRule = {
  required: false,
  example: '{"prepSeconds":45,"responseSeconds":45}',
  validate: (c, fail) => {
    assertOnlyFields(c, ['prepSeconds', 'responseSeconds'], fail);
    for (const [field, min] of [
      ['prepSeconds', 0],
      ['responseSeconds', 1],
    ] as const) {
      const value = c[field];
      if (
        value !== undefined &&
        (!Number.isInteger(value) || (value as number) < min)
      ) {
        fail(`${field} must be an integer >= ${min}`);
      }
    }
  },
};

const GROUP_CONTENT_RULES: Record<QuestionType, IContentRule | null> = {
  [QuestionType.MULTIPLE_CHOICE]: null,
  [QuestionType.MULTIPLE_CHOICE_MULTI]: null,
  [QuestionType.TRUE_FALSE_NOT_GIVEN]: null,
  [QuestionType.YES_NO_NOT_GIVEN]: null,
  [QuestionType.MATCHING_HEADINGS]: matching(true),
  // Options are paragraph letters, so text is optional
  [QuestionType.MATCHING_INFORMATION]: matching(false),
  [QuestionType.MATCHING_FEATURES]: matching(true),
  [QuestionType.MATCHING_SENTENCE_ENDINGS]: matching(true),
  [QuestionType.CLASSIFICATION]: matching(true),
  [QuestionType.FORM_COMPLETION]: template,
  // Usually one sentence per question in `prompt`, so the template is optional
  [QuestionType.SENTENCE_COMPLETION]: completion(false),
  [QuestionType.SUMMARY_COMPLETION]: completion(true),
  [QuestionType.NOTE_COMPLETION]: completion(true),
  [QuestionType.TABLE_COMPLETION]: {
    required: true,
    example:
      '{"table":{"headers":["Event","Date"],"rows":[["Opening","{{5}}"]]}}',
    validate: (c, fail) => {
      assertOnlyFields(c, ['table'], fail);
      if (!isPlainObject(c.table)) fail('table must be an object');
      const table = c.table as Record<string, unknown>;
      assertOnlyFields(table, ['headers', 'rows'], fail);
      assertOptionalStrings(table.headers, 'table.headers', fail);
      const rows = assertRows(table.rows, 'table.rows', fail);
      assertPlaceholders(
        rows.flat().flatMap((cell) => collectPlaceholders(cell, fail)),
        fail,
      );
    },
  },
  [QuestionType.FLOW_CHART_COMPLETION]: template,
  [QuestionType.DIAGRAM_LABELLING]: null,
  [QuestionType.MAP_LABELLING]: labels,
  [QuestionType.PLAN_LABELLING]: labels,
  [QuestionType.SHORT_ANSWER]: null,
  [QuestionType.PHOTO_DESCRIPTION]: null,
  [QuestionType.QUESTION_RESPONSE]: null,
  [QuestionType.TEXT_COMPLETION]: null,
  [QuestionType.READ_ALOUD]: null,
  [QuestionType.DESCRIBE_PICTURE]: null,
  [QuestionType.RESPOND_TO_QUESTIONS]: null,
  [QuestionType.RESPOND_USING_INFO]: {
    required: true,
    example:
      '{"info":{"title":"Conference Schedule","rows":[["9:00","Keynote"]]}}',
    validate: (c, fail) => {
      assertOnlyFields(c, ['info'], fail);
      if (!isPlainObject(c.info)) fail('info must be an object');
      const info = c.info as Record<string, unknown>;
      assertOnlyFields(info, ['title', 'rows'], fail);
      if (info.title !== undefined && typeof info.title !== 'string') {
        fail('info.title must be a string');
      }
      assertRows(info.rows, 'info.rows', fail);
    },
  },
  [QuestionType.EXPRESS_OPINION]: null,
  [QuestionType.WRITE_SENTENCE_PICTURE]: null,
  [QuestionType.RESPOND_WRITTEN_REQUEST]: null,
  [QuestionType.OPINION_ESSAY]: null,
};

const QUESTION_CONTENT_RULES: Record<QuestionType, IContentRule | null> = {
  [QuestionType.MULTIPLE_CHOICE]: choices(true),
  [QuestionType.MULTIPLE_CHOICE_MULTI]: choices(true),
  [QuestionType.TRUE_FALSE_NOT_GIVEN]: null,
  [QuestionType.YES_NO_NOT_GIVEN]: null,
  [QuestionType.MATCHING_HEADINGS]: null,
  [QuestionType.MATCHING_INFORMATION]: null,
  [QuestionType.MATCHING_FEATURES]: null,
  [QuestionType.MATCHING_SENTENCE_ENDINGS]: null,
  [QuestionType.CLASSIFICATION]: null,
  [QuestionType.FORM_COMPLETION]: null,
  [QuestionType.SENTENCE_COMPLETION]: null,
  [QuestionType.SUMMARY_COMPLETION]: null,
  [QuestionType.NOTE_COMPLETION]: null,
  [QuestionType.TABLE_COMPLETION]: null,
  [QuestionType.FLOW_CHART_COMPLETION]: null,
  [QuestionType.DIAGRAM_LABELLING]: null,
  [QuestionType.MAP_LABELLING]: null,
  [QuestionType.PLAN_LABELLING]: null,
  [QuestionType.SHORT_ANSWER]: null,
  // Choices are only spoken in the audio, so options carry no text
  [QuestionType.PHOTO_DESCRIPTION]: choices(false),
  [QuestionType.QUESTION_RESPONSE]: choices(false),
  [QuestionType.TEXT_COMPLETION]: choices(true),
  [QuestionType.READ_ALOUD]: timing,
  [QuestionType.DESCRIBE_PICTURE]: timing,
  [QuestionType.RESPOND_TO_QUESTIONS]: timing,
  [QuestionType.RESPOND_USING_INFO]: timing,
  [QuestionType.EXPRESS_OPINION]: timing,
  [QuestionType.WRITE_SENTENCE_PICTURE]: timing,
  [QuestionType.RESPOND_WRITTEN_REQUEST]: timing,
  [QuestionType.OPINION_ESSAY]: timing,
};

function assertContent(
  rule: IContentRule | null,
  content: Content,
  label: string,
) {
  const fail: Fail = (reason) => {
    throw new BadRequestException(
      `Invalid content for ${label}: ${reason}${rule ? `; expected ${rule.example}` : ''}`,
    );
  };

  if (content == null) {
    if (rule?.required) fail('content is required');
    return;
  }
  if (!rule) {
    fail('this question type takes no content');
  }
  rule.validate(content, fail);
}

// Placeholder numbers of a group's template/table, or null when it has none.
// Assumes the content already passed assertValidGroupContent.
export function groupPlaceholders(type: QuestionType, content: Content) {
  const fail: Fail = (reason) => {
    throw new BadRequestException(reason);
  };
  if (type === QuestionType.TABLE_COMPLETION) {
    const rows = (content?.table as { rows?: string[][] } | undefined)?.rows;
    return rows
      ? rows.flat().flatMap((cell) => collectPlaceholders(cell, fail))
      : null;
  }
  return typeof content?.template === 'string'
    ? collectPlaceholders(content.template, fail)
    : null;
}

export function assertValidGroupContent(type: QuestionType, content: Content) {
  assertContent(GROUP_CONTENT_RULES[type], content, `question group (${type})`);
}

export function assertValidQuestionContent(
  type: QuestionType,
  content: Content,
  numberFrom: number,
) {
  assertContent(
    QUESTION_CONTENT_RULES[type],
    content,
    `question ${numberFrom} (${type})`,
  );
}

export function assertValidEvidence(evidence: Content, numberFrom: number) {
  if (evidence == null) return;

  const fail: Fail = (reason) => {
    throw new BadRequestException(
      `Invalid evidence for question ${numberFrom}: ${reason}; expected {"paragraphId":12,"quote":"..."}`,
    );
  };
  assertOnlyFields(evidence, ['paragraphId', 'quote'], fail);
  const { paragraphId, quote } = evidence;
  if (paragraphId === undefined && quote === undefined) {
    fail('needs paragraphId and/or quote');
  }
  if (
    paragraphId !== undefined &&
    (!Number.isInteger(paragraphId) || (paragraphId as number) < 1)
  ) {
    fail('paragraphId must be a positive integer');
  }
  if (quote !== undefined && !isNonEmptyString(quote)) {
    fail('quote must be a non-empty string');
  }
}
