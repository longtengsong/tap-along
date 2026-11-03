import { readFile } from 'node:fs/promises';
import { composeTeacherMessages } from '../../src/main/prompts/index.ts';

export const DEFAULT_PROMPT_FIXTURE_URL = new URL(
  '../../tests/fixtures/prompts/teacher-cases.json',
  import.meta.url,
);

export class PromptCaseSelectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PromptCaseSelectionError';
  }
}

export const loadPromptFixture = async (
  fixtureUrl = DEFAULT_PROMPT_FIXTURE_URL,
) => JSON.parse(await readFile(fixtureUrl, 'utf8'));

export const parsePromptCaseIds = (value) => [
  ...new Set(
    String(value)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  ),
];

export const selectPromptCases = (fixture, caseIds = []) => {
  if (caseIds.length === 0) {
    return fixture.cases;
  }

  const casesById = new Map(
    fixture.cases.map((testCase) => [testCase.id, testCase]),
  );
  const unknownIds = caseIds.filter((id) => !casesById.has(id));

  if (unknownIds.length > 0) {
    throw new PromptCaseSelectionError(
      `未知 Prompt 评测场景：${unknownIds.join(', ')}`,
    );
  }

  return caseIds.map((id) => casesById.get(id));
};

export const buildPromptMessages = (fixture, testCase) => {
  const maintenanceKind =
    testCase.mode === 'edit' || testCase.mode === 'append'
      ? testCase.mode
      : undefined;

  return composeTeacherMessages({
    page: fixture.pages[testCase.page],
    contextPage: testCase.contextPage
      ? fixture.pages[testCase.contextPage]
      : undefined,
    compressedPages: testCase.compressedPages,
    userText: testCase.userText,
    maintenanceKind,
  });
};
