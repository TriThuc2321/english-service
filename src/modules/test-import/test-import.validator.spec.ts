import type { IImportGroup, ITestImport } from './test-import.type.js';

import { MarkedBy } from '../../entities/passage.entity.js';
import { ExamType, QuestionType, SkillType } from '../../types/test.type.js';
import { validateTestImport } from './test-import.validator.js';

const notes = (): IImportGroup => ({
  questionType: QuestionType.NOTE_COMPLETION,
  wordLimit: 1,
  content: { template: 'The {{1}} grew and the {{2}} were full' },
  questions: [
    {
      numberFrom: 1,
      answer: { accepted: ['population'] },
      evidence: { paragraph: 1, quote: 'population grew' },
    },
    { numberFrom: 2, answer: { accepted: ['streets'] } },
  ],
});

const tfng = (): IImportGroup => ({
  questionType: QuestionType.TRUE_FALSE_NOT_GIVEN,
  questions: [
    { numberFrom: 3, prompt: 'It was the first.', answer: { key: 'TRUE' } },
  ],
});

const build = (groups: IImportGroup[] = [notes(), tfng()]): ITestImport => ({
  examType: ExamType.IELTS_ACADEMIC,
  title: 'Test 1',
  sections: [
    {
      skill: SkillType.READING,
      parts: [
        {
          passage: {
            title: 'London',
            markedBy: MarkedBy.ALPHABET,
            paragraphs: [
              'London’s population grew, fast.',
              'The streets were full of horse-drawn traffic.',
            ],
          },
          groups,
        },
      ],
    },
  ],
});

const messages = (doc: ITestImport) =>
  validateTestImport(doc).map((i) => `${i.severity}: ${i.message}`);

describe('validateTestImport', () => {
  it('accepts a well-formed test', () => {
    expect(validateTestImport(build())).toEqual([]);
  });

  it('reports a gap in the question numbering', () => {
    const doc = build();
    doc.sections[0].parts[0].groups[1].questions[0].numberFrom = 4;

    expect(messages(doc)).toContainEqual(
      expect.stringContaining('expected question 3, got 4'),
    );
  });

  it('counts a multi-key question as its whole range', () => {
    const doc = build([
      notes(),
      {
        questionType: QuestionType.MULTIPLE_CHOICE_MULTI,
        questions: [
          {
            numberFrom: 3,
            numberTo: 4,
            prompt: 'Which TWO?',
            content: {
              options: ['A', 'B', 'C'].map((key) => ({ key, text: key })),
            },
            answer: { keys: ['A', 'C'] },
          },
        ],
      },
      { ...tfng(), questions: [{ ...tfng().questions[0], numberFrom: 5 }] },
    ]);

    expect(validateTestImport(doc)).toEqual([]);
  });

  it('reuses the question format rules', () => {
    const doc = build();
    doc.sections[0].parts[0].groups[1].questions[0].answer = { key: 'YES' };

    expect(messages(doc)).toContainEqual(
      expect.stringContaining('key must be one of TRUE, FALSE, NOT GIVEN'),
    );
  });

  it('requires a placeholder for every question of a template group', () => {
    const group = notes();
    group.content = { template: 'The {{1}} grew and the {{9}} were full' };

    expect(messages(build([group, tfng()]))).toEqual([
      'error: no {{n}} placeholder for question(s) 2',
      'error: placeholder(s) {{9}} have no question',
    ]);
  });

  it('rejects a placeholder used more than once', () => {
    const group = notes();
    group.content = {
      template: 'The {{1}} grew, the {{1}} and the {{2}} were full {{9}} {{9}}',
    };

    expect(messages(build([group, tfng()]))).toEqual([
      expect.stringContaining('placeholder {{1}} appears more than once'),
      'error: placeholder(s) {{9}} have no question',
    ]);
  });

  it('requires a prompt where the question is not in a template', () => {
    const group = tfng();
    group.questions[0].prompt = ' ';

    expect(messages(build([notes(), group]))).toContainEqual(
      expect.stringContaining('needs a prompt'),
    );
  });

  it('warns when a written answer is not in the passage', () => {
    const group = notes();
    group.questions[1].answer = { accepted: ['roads'] };

    expect(validateTestImport(build([group, tfng()]))).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: 'answer "roads" to 2 is not in the passage',
      }),
    ]);
  });

  it('checks the evidence quote against its paragraph', () => {
    const group = notes();
    group.questions[0].evidence = { paragraph: 2, quote: 'population grew' };
    group.questions[1].evidence = { paragraph: 1, quote: 'invented words' };

    expect(messages(build([group, tfng()]))).toEqual([
      'error: evidence quote of 1 is in paragraph 1, not 2',
      'error: evidence quote of 2 is not in the passage',
    ]);
  });

  it('matches a quote regardless of the quotation marks around it', () => {
    const doc = build();
    doc.sections[0].parts[0].passage!.paragraphs[1] =
      'He said: ‘The streets were full.’ It wasn’t over.';
    doc.sections[0].parts[0].groups[0].questions[1].evidence = {
      paragraph: 2,
      quote: 'The streets were full. It wasn’t over',
    };

    expect(validateTestImport(doc)).toEqual([]);
  });

  it('warns when paragraph-matching options differ from the passage labels', () => {
    const doc = build([
      notes(),
      {
        questionType: QuestionType.MATCHING_INFORMATION,
        content: { options: [{ key: 'A' }, { key: 'B' }, { key: 'C' }] },
        questions: [{ numberFrom: 3, prompt: 'traffic', answer: { key: 'B' } }],
      },
    ]);

    expect(messages(doc)).toEqual([
      'warning: options A,B,C differ from the passage paragraphs A,B',
    ]);
  });

  it('rejects a section the exam does not have', () => {
    const doc = build();
    doc.examType = ExamType.TOEIC_SW;

    expect(messages(doc)).toContainEqual(
      'error: TOEIC_SW has no READING section',
    );
  });
});
