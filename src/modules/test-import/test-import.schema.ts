import { MarkedBy } from '../../entities/passage.entity.js';
import { ExamType, QuestionType, SkillType } from '../../types/test.type.js';

const nullableString = { type: ['string', 'null'] };

const option = {
  type: 'object',
  properties: { key: { type: 'string' }, text: { type: 'string' } },
  required: ['key'],
  additionalProperties: false,
};

// JSON Schema of ITestImport, used as the tool input_schema when an LLM
// extracts a test. It only fixes the shape: the per-type content/answer rules
// of docs/question-formats.md are enforced by validateTestImport
export const TEST_IMPORT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    examType: { enum: Object.values(ExamType) },
    title: { type: 'string' },
    slug: { type: 'string' },
    source: { type: 'string' },
    durationMinutes: { type: 'integer', minimum: 1 },
    sections: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/section' },
    },
  },
  required: ['examType', 'title', 'sections'],
  additionalProperties: false,
  $defs: {
    section: {
      type: 'object',
      properties: {
        skill: { enum: Object.values(SkillType) },
        durationMinutes: { type: ['integer', 'null'], minimum: 1 },
        parts: { type: 'array', minItems: 1, items: { $ref: '#/$defs/part' } },
      },
      required: ['skill', 'parts'],
      additionalProperties: false,
    },
    part: {
      type: 'object',
      properties: {
        title: nullableString,
        instruction: nullableString,
        passage: {
          anyOf: [{ $ref: '#/$defs/passage' }, { type: 'null' }],
        },
        groups: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/group' },
        },
      },
      required: ['groups'],
      additionalProperties: false,
    },
    passage: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        subtitle: nullableString,
        markedBy: {
          enum: Object.values(MarkedBy),
          description:
            'ALPHABET when the passage labels its paragraphs A, B, C…; the labels are not repeated in the paragraph text',
        },
        paragraphs: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
          description:
            'One item per labelled paragraph (or per paragraph when unlabelled); sub-paragraphs under one label are joined with a blank line',
        },
      },
      required: ['title', 'markedBy', 'paragraphs'],
      additionalProperties: false,
    },
    group: {
      type: 'object',
      properties: {
        questionType: { enum: Object.values(QuestionType) },
        instruction: nullableString,
        wordLimit: {
          type: ['integer', 'null'],
          minimum: 1,
          description: '"ONE WORD ONLY" -> 1, "NO MORE THAN TWO WORDS" -> 2',
        },
        content: {
          type: ['object', 'null'],
          properties: {
            template: {
              type: 'string',
              description: 'Text with {{n}} where question n is answered',
            },
            options: { type: 'array', items: option },
            allowReuse: { type: 'boolean' },
            table: {
              type: 'object',
              properties: {
                headers: { type: 'array', items: { type: 'string' } },
                rows: {
                  type: 'array',
                  items: { type: 'array', items: { type: 'string' } },
                },
              },
              required: ['rows'],
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        questions: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/question' },
        },
      },
      required: ['questionType', 'questions'],
      additionalProperties: false,
    },
    question: {
      type: 'object',
      properties: {
        numberFrom: { type: 'integer', minimum: 1 },
        numberTo: {
          type: 'integer',
          minimum: 1,
          description:
            'Only for "Choose TWO" questions answered as one item, e.g. 23-24',
        },
        prompt: nullableString,
        content: {
          type: ['object', 'null'],
          properties: { options: { type: 'array', items: option } },
          additionalProperties: false,
        },
        answer: {
          oneOf: [
            {
              type: 'object',
              properties: { key: { type: 'string' } },
              required: ['key'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                keys: { type: 'array', items: { type: 'string' } },
              },
              required: ['keys'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                accepted: { type: 'array', items: { type: 'string' } },
              },
              required: ['accepted'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                sample: { type: 'string' },
                rubric: { type: 'object' },
              },
              required: ['sample'],
              additionalProperties: false,
            },
          ],
        },
        explanation: nullableString,
        evidence: {
          type: ['object', 'null'],
          properties: {
            paragraph: {
              type: 'integer',
              minimum: 1,
              description: '1-based index into the part passage paragraphs',
            },
            quote: {
              type: 'string',
              description: 'Copied verbatim from that paragraph',
            },
          },
          additionalProperties: false,
        },
      },
      required: ['numberFrom', 'answer'],
      additionalProperties: false,
    },
  },
} as const;
