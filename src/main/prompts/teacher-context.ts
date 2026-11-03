import type { PageMessageSnapshot, PageSnapshot } from '../../shared/pages.ts';
import { PROMPT_CATALOG } from './catalog.ts';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompressedPagePrompt {
  pageId: number;
  body: string;
  depth: number;
}

export const renderPromptTemplate = (
  template: string,
  values: Record<string, string>,
) =>
  template.replace(/\{\{([^}]+)\}\}/g, (placeholder, key: string) => {
    return values[key] ?? placeholder;
  });

export const escapePromptData = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

export const buildCurrentPageContext = (page: PageSnapshot) =>
  renderPromptTemplate(PROMPT_CATALOG.teacher.context.currentPage, {
    title: escapePromptData(page.title),
    body: escapePromptData(page.body),
  });

export const buildResumePageContext = (
  page: PageSnapshot,
  kind: 'targetPage',
) =>
  renderPromptTemplate(PROMPT_CATALOG.teacher.context[kind], {
    title: escapePromptData(page.title),
    body: escapePromptData(page.body),
  });

export const buildCompressedPageContext = ({
  body,
  depth,
}: CompressedPagePrompt) =>
  renderPromptTemplate(PROMPT_CATALOG.teacher.context.closedPage, {
    depth: String(depth),
    body: escapePromptData(body),
  });

const toChatMessage = (message: PageMessageSnapshot): ChatMessage | null => {
  if (!message.text.trim()) {
    return null;
  }

  return {
    role: message.role === 'teacher' ? 'assistant' : 'user',
    content: message.text,
  };
};

export const toPageMessages = (page: PageSnapshot) =>
  page.messages
    .map(toChatMessage)
    .filter((message): message is ChatMessage => message !== null);
