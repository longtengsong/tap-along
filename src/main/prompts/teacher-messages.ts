import type { PageSnapshot } from '../../shared/pages.ts';
import type { PromptCatalogValues } from '../../shared/prompts.ts';
import { PROMPT_CATALOG } from './catalog.ts';
import {
  buildCompressedPageContext,
  buildCurrentPageContext,
  buildResumePageContext,
  toPageMessages,
  type ChatMessage,
  type CompressedPagePrompt,
} from './teacher-context.ts';

export interface TeacherPromptInput {
  page: PageSnapshot;
  userText: string;
  contextPage?: PageSnapshot;
  compressedPages?: CompressedPagePrompt[];
  maintenanceKind?: 'edit' | 'append';
}

const normalizeCompressedPages = (pages: CompressedPagePrompt[]) => {
  const seen = new Set<number>();

  return [...pages]
    .filter(
      (page) =>
        Number.isInteger(page.pageId) && page.pageId > 0 && page.body.trim(),
    )
    .sort(
      (left, right) => left.depth - right.depth || left.pageId - right.pageId,
    )
    .filter((page) => {
      if (seen.has(page.pageId)) {
        return false;
      }

      seen.add(page.pageId);
      return true;
    });
};

const toSystemMessage = (content: string): ChatMessage[] =>
  content.trim() ? [{ role: 'system', content }] : [];

const buildCompressedContextMessages = (
  pages: CompressedPagePrompt[],
  promptCatalog: PromptCatalogValues,
) => {
  if (pages.length === 0) {
    return [];
  }

  return [
    ...toSystemMessage(promptCatalog.teacher.compressedContextPolicy),
    ...pages.map(
      (page): ChatMessage => ({
        role: 'system',
        content: buildCompressedPageContext(page, promptCatalog),
      }),
    ),
  ].filter((message) => message.content.trim());
};

export const buildTeacherMessages = (
  { page, userText, compressedPages = [] }: TeacherPromptInput,
  promptCatalog: PromptCatalogValues = PROMPT_CATALOG,
): ChatMessage[] => {
  const normalizedCompressedPages = normalizeCompressedPages(compressedPages);
  const messages: ChatMessage[] = [
    ...toSystemMessage(promptCatalog.teacher.system),
    ...toSystemMessage(promptCatalog.teacher.languagePolicy),
    ...toSystemMessage(promptCatalog.teacher.contextBoundary),
    ...buildCompressedContextMessages(normalizedCompressedPages, promptCatalog),
    ...toSystemMessage(buildCurrentPageContext(page, promptCatalog)),
    ...toPageMessages(page),
  ];
  const latest = messages.at(-1);

  if (latest?.role !== 'user' || latest.content !== userText) {
    messages.push({ role: 'user', content: userText });
  }

  return messages;
};

export const buildResumeTeacherMessages = (
  {
    page,
    contextPage,
    compressedPages = [],
  }: TeacherPromptInput & {
    contextPage: PageSnapshot;
  },
  promptCatalog: PromptCatalogValues = PROMPT_CATALOG,
): ChatMessage[] => {
  const targetMessages = toPageMessages(page);
  const normalizedCompressedPages = normalizeCompressedPages([
    ...compressedPages,
    {
      pageId: contextPage.id,
      body: contextPage.body,
      depth: 0,
    },
  ]);
  const messages: ChatMessage[] = [
    ...toSystemMessage(promptCatalog.teacher.system),
    ...toSystemMessage(promptCatalog.teacher.languagePolicy),
    ...toSystemMessage(promptCatalog.teacher.resume),
    ...toSystemMessage(promptCatalog.teacher.contextBoundary),
    ...buildCompressedContextMessages(normalizedCompressedPages, promptCatalog),
    ...toSystemMessage(
      buildResumePageContext(page, 'targetPage', promptCatalog),
    ),
    ...targetMessages,
  ];

  return messages;
};

export const buildMaintenanceTeacherMessages = (
  {
    page,
    userText,
    maintenanceKind,
    compressedPages = [],
  }: TeacherPromptInput & {
    maintenanceKind: 'edit' | 'append';
  },
  promptCatalog: PromptCatalogValues = PROMPT_CATALOG,
): ChatMessage[] => {
  const action = promptCatalog.teacher.maintenanceAction[maintenanceKind];
  const normalizedCompressedPages = normalizeCompressedPages(compressedPages);

  return [
    ...toSystemMessage(promptCatalog.teacher.system),
    ...toSystemMessage(promptCatalog.teacher.languagePolicy),
    ...toSystemMessage(promptCatalog.teacher.maintenance),
    ...toSystemMessage(action),
    ...toSystemMessage(promptCatalog.teacher.contextBoundary),
    ...buildCompressedContextMessages(normalizedCompressedPages, promptCatalog),
    ...toSystemMessage(buildCurrentPageContext(page, promptCatalog)),
    ...toPageMessages(page),
    { role: 'user', content: userText },
  ];
};

export const composeTeacherMessages = (
  input: TeacherPromptInput,
  promptCatalog: PromptCatalogValues = PROMPT_CATALOG,
): ChatMessage[] => {
  if (input.maintenanceKind) {
    return buildMaintenanceTeacherMessages(
      {
        ...input,
        maintenanceKind: input.maintenanceKind,
      },
      promptCatalog,
    );
  }

  if (input.contextPage) {
    return buildResumeTeacherMessages(
      {
        ...input,
        contextPage: input.contextPage,
      },
      promptCatalog,
    );
  }

  return buildTeacherMessages(input, promptCatalog);
};
