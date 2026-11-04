import type { PageSnapshot } from '../../shared/pages.ts';
import type { ResearchEvidence } from '../../shared/search.ts';
import type { PromptCatalogValues } from '../../shared/prompts.ts';
import { PROMPT_CATALOG } from './catalog.ts';
import { buildResearchMessages } from './research.ts';
import {
  buildCompressedPageContext,
  buildCurrentPageContext,
  buildResumePageContext,
  toPageMessages,
  toTimelineMessages,
  type ChatMessage,
  type CompressedPagePrompt,
} from './teacher-context.ts';

export interface TeacherPromptInput {
  page: PageSnapshot;
  userText: string;
  contextPage?: PageSnapshot;
  compressedPages?: CompressedPagePrompt[];
  maintenanceKind?: 'edit' | 'append';
  research?: ResearchEvidence[];
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

const buildCompressedContextPolicy = (
  pages: CompressedPagePrompt[],
  promptCatalog: PromptCatalogValues,
) =>
  pages.length === 0
    ? []
    : toSystemMessage(promptCatalog.teacher.compressedContextPolicy);

const renderCompressedPage = (
  page: CompressedPagePrompt,
  promptCatalog: PromptCatalogValues,
): ChatMessage => ({
  role: 'system',
  content: buildCompressedPageContext(page, promptCatalog),
});

const buildTimeline = (
  page: PageSnapshot,
  compressedPages: CompressedPagePrompt[],
  promptCatalog: PromptCatalogValues,
  options: { trailingPlacement?: 'end' | 'beforeLastMessage' } = {},
) =>
  toTimelineMessages(
    page,
    compressedPages,
    (compressedPage) => renderCompressedPage(compressedPage, promptCatalog),
    options,
  );

export const buildTeacherMessages = (
  { page, userText, compressedPages = [] }: TeacherPromptInput,
  promptCatalog: PromptCatalogValues = PROMPT_CATALOG,
): ChatMessage[] => {
  const normalizedCompressedPages = normalizeCompressedPages(compressedPages);
  const lastHistoryMessage = toPageMessages(page).at(-1);
  const userTextInHistory =
    lastHistoryMessage?.role === 'user' &&
    lastHistoryMessage.content === userText;
  const messages: ChatMessage[] = [
    ...toSystemMessage(promptCatalog.teacher.system),
    ...toSystemMessage(promptCatalog.teacher.languagePolicy),
    ...toSystemMessage(promptCatalog.teacher.contextBoundary),
    ...buildCompressedContextPolicy(normalizedCompressedPages, promptCatalog),
    ...toSystemMessage(buildCurrentPageContext(page, promptCatalog)),
    // 最新提问已落盘时保留在最后，无锚点的老上下文插在它之前。
    ...buildTimeline(page, normalizedCompressedPages, promptCatalog, {
      trailingPlacement: userTextInHistory ? 'beforeLastMessage' : 'end',
    }),
  ];

  if (!userTextInHistory) {
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
  const normalizedCompressedPages = normalizeCompressedPages([
    ...compressedPages,
    {
      pageId: contextPage.id,
      body: contextPage.body,
      depth: 0,
      rootPageId: contextPage.id,
    },
  ]);
  const messages: ChatMessage[] = [
    ...toSystemMessage(promptCatalog.teacher.system),
    ...toSystemMessage(promptCatalog.teacher.languagePolicy),
    ...toSystemMessage(promptCatalog.teacher.resume),
    ...toSystemMessage(promptCatalog.teacher.contextBoundary),
    ...buildCompressedContextPolicy(normalizedCompressedPages, promptCatalog),
    ...toSystemMessage(
      buildResumePageContext(page, 'targetPage', promptCatalog),
    ),
    ...buildTimeline(page, normalizedCompressedPages, promptCatalog),
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
    ...buildCompressedContextPolicy(normalizedCompressedPages, promptCatalog),
    ...toSystemMessage(buildCurrentPageContext(page, promptCatalog)),
    ...buildTimeline(page, normalizedCompressedPages, promptCatalog),
    { role: 'user', content: userText },
  ];
};

export const composeTeacherMessages = (
  input: TeacherPromptInput,
  promptCatalog: PromptCatalogValues = PROMPT_CATALOG,
): ChatMessage[] => {
  if (input.research && input.research.length > 0) {
    return buildResearchMessages({
      page: input.page,
      userText: input.userText,
      evidence: input.research,
    });
  }

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
