import type { PageSnapshot } from '../../shared/pages.ts';
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

const buildCompressedContextMessages = (pages: CompressedPagePrompt[]) => {
  if (pages.length === 0) {
    return [];
  }

  return [
    {
      role: 'system' as const,
      content: PROMPT_CATALOG.teacher.compressedContextPolicy,
    },
    ...pages.map(
      (page): ChatMessage => ({
        role: 'system',
        content: buildCompressedPageContext(page),
      }),
    ),
  ];
};

export const buildTeacherMessages = ({
  page,
  userText,
  compressedPages = [],
}: TeacherPromptInput): ChatMessage[] => {
  const normalizedCompressedPages = normalizeCompressedPages(compressedPages);
  const messages: ChatMessage[] = [
    { role: 'system', content: PROMPT_CATALOG.teacher.system },
    { role: 'system', content: PROMPT_CATALOG.teacher.languagePolicy },
    { role: 'system', content: PROMPT_CATALOG.teacher.contextBoundary },
    ...buildCompressedContextMessages(normalizedCompressedPages),
    { role: 'system', content: buildCurrentPageContext(page) },
    ...toPageMessages(page),
  ];
  const latest = messages.at(-1);

  if (latest?.role !== 'user' || latest.content !== userText) {
    messages.push({ role: 'user', content: userText });
  }

  return messages;
};

export const buildResumeTeacherMessages = ({
  page,
  contextPage,
  compressedPages = [],
}: TeacherPromptInput & { contextPage: PageSnapshot }): ChatMessage[] => {
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
    { role: 'system', content: PROMPT_CATALOG.teacher.system },
    { role: 'system', content: PROMPT_CATALOG.teacher.languagePolicy },
    { role: 'system', content: PROMPT_CATALOG.teacher.resume },
    { role: 'system', content: PROMPT_CATALOG.teacher.contextBoundary },
    ...buildCompressedContextMessages(normalizedCompressedPages),
    {
      role: 'system',
      content: buildResumePageContext(page, 'targetPage'),
    },
    ...targetMessages,
  ];

  return messages;
};

export const buildMaintenanceTeacherMessages = ({
  page,
  userText,
  maintenanceKind,
  compressedPages = [],
}: TeacherPromptInput & {
  maintenanceKind: 'edit' | 'append';
}): ChatMessage[] => {
  const action = PROMPT_CATALOG.teacher.maintenanceAction[maintenanceKind];
  const normalizedCompressedPages = normalizeCompressedPages(compressedPages);

  return [
    { role: 'system', content: PROMPT_CATALOG.teacher.system },
    { role: 'system', content: PROMPT_CATALOG.teacher.languagePolicy },
    { role: 'system', content: PROMPT_CATALOG.teacher.maintenance },
    { role: 'system', content: action },
    { role: 'system', content: PROMPT_CATALOG.teacher.contextBoundary },
    ...buildCompressedContextMessages(normalizedCompressedPages),
    { role: 'system', content: buildCurrentPageContext(page) },
    ...toPageMessages(page),
    { role: 'user', content: userText },
  ];
};

export const composeTeacherMessages = (
  input: TeacherPromptInput,
): ChatMessage[] => {
  if (input.maintenanceKind) {
    return buildMaintenanceTeacherMessages({
      ...input,
      maintenanceKind: input.maintenanceKind,
    });
  }

  if (input.contextPage) {
    return buildResumeTeacherMessages({
      ...input,
      contextPage: input.contextPage,
    });
  }

  return buildTeacherMessages(input);
};
