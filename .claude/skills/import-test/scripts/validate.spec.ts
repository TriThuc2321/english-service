import { readFileSync } from 'node:fs';

import type { ITestImport } from '../../../../src/modules/test-import/test-import.type.js';

import { validateTestImport } from '../../../../src/modules/test-import/test-import.validator.js';

it('validates the import document', () => {
  const doc = JSON.parse(
    readFileSync(process.env.IMPORT_FILE!, 'utf8'),
  ) as ITestImport;
  const issues = validateTestImport(doc);

  const sections = doc.sections.map((section) => {
    const questions = section.parts
      .flatMap((p) => p.groups)
      .flatMap((g) => g.questions);
    return {
      skill: section.skill,
      numbers: questions.reduce(
        (n, q) => n + (q.numberTo ?? q.numberFrom) - q.numberFrom + 1,
        0,
      ),
      withoutExplanation: questions
        .filter((q) => !q.explanation?.trim())
        .map((q) => q.numberFrom),
      withoutEvidence: questions
        .filter((q) => !q.evidence)
        .map((q) => q.numberFrom),
    };
  });

  console.log(
    [
      ...sections.map((s) => JSON.stringify(s)),
      ...issues.map((i) => `${i.severity} ${i.path}: ${i.message}`),
      `${issues.length} issue(s)`,
    ].join('\n'),
  );
  expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
});
