import type { PageMessageSnapshot, PageSnapshot } from '../../shared/pages.ts';
import type { PromptCatalogValues } from '../../shared/prompts.ts';
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
  /**
   * 该页面所属分叉分支的根页编号，用于在目标页时间线上定位插入位置。
   * 缺省时按自身编号定位（老数据没有分叉锚点记录）。
   */
  rootPageId?: number;
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

export const buildCurrentPageContext = (
  page: PageSnapshot,
  promptCatalog: PromptCatalogValues = PROMPT_CATALOG,
) =>
  renderPromptTemplate(promptCatalog.teacher.context.currentPage, {
    title: escapePromptData(page.title),
    body: escapePromptData(page.body),
  });

export const buildResumePageContext = (
  page: PageSnapshot,
  kind: 'targetPage',
  promptCatalog: PromptCatalogValues = PROMPT_CATALOG,
) =>
  renderPromptTemplate(promptCatalog.teacher.context[kind], {
    title: escapePromptData(page.title),
    body: escapePromptData(page.body),
  });

export const buildCompressedPageContext = (
  { body, depth }: CompressedPagePrompt,
  promptCatalog: PromptCatalogValues = PROMPT_CATALOG,
) =>
  renderPromptTemplate(promptCatalog.teacher.context.closedPage, {
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

/**
 * forked 记录只占时间线位置，不进模型对谈；返回 子页编号 -> 日志下标 的映射。
 */
const collectForkAnchors = (page: PageSnapshot) => {
  const anchors = new Map<number, number>();

  page.messages.forEach((message, index) => {
    if (message.actionType !== 'forked') {
      return;
    }

    const childPageId = message.childPageId;

    if (
      typeof childPageId !== 'number' ||
      !Number.isInteger(childPageId) ||
      childPageId <= 0 ||
      anchors.has(childPageId)
    ) {
      return;
    }

    anchors.set(childPageId, index);
  });

  return anchors;
};

/**
 * 把页面历史还原成按真实发生时间排列的时间线：
 * 已合上的子页正文插回它被另起一页的那一刻，而不是整体堆在历史最前面。
 * 找不到分叉锚点的老数据默认追加在历史之后，保持确定性。
 */
export const toTimelineMessages = (
  page: PageSnapshot,
  compressedPages: CompressedPagePrompt[],
  renderCompressed: (page: CompressedPagePrompt) => ChatMessage,
  options: { trailingPlacement?: 'end' | 'beforeLastMessage' } = {},
): ChatMessage[] => {
  const anchors = collectForkAnchors(page);
  const anchoredBlocks = new Map<number, CompressedPagePrompt[]>();
  const trailingBlocks: CompressedPagePrompt[] = [];

  for (const compressedPage of compressedPages) {
    const rootPageId = compressedPage.rootPageId ?? compressedPage.pageId;

    if (!anchors.has(rootPageId)) {
      trailingBlocks.push(compressedPage);
      continue;
    }

    const blocks = anchoredBlocks.get(rootPageId) ?? [];
    blocks.push(compressedPage);
    anchoredBlocks.set(rootPageId, blocks);
  }

  const blocksAtIndex = new Map<number, CompressedPagePrompt[]>();

  for (const [rootPageId, index] of anchors) {
    const blocks = anchoredBlocks.get(rootPageId);

    if (!blocks || blocks.length === 0) {
      continue;
    }

    blocksAtIndex.set(index, [...(blocksAtIndex.get(index) ?? []), ...blocks]);
  }

  const timeline: ChatMessage[] = [];

  page.messages.forEach((message, index) => {
    const chatMessage = toChatMessage(message);

    if (chatMessage) {
      timeline.push(chatMessage);
    }

    for (const block of blocksAtIndex.get(index) ?? []) {
      timeline.push(renderCompressed(block));
    }
  });

  const renderedTrailing = trailingBlocks.map(renderCompressed);
  const beforeLastMessage =
    options.trailingPlacement === 'beforeLastMessage' &&
    renderedTrailing.length > 0 &&
    timeline.length > 0;

  if (beforeLastMessage) {
    timeline.splice(timeline.length - 1, 0, ...renderedTrailing);
    return timeline;
  }

  timeline.push(...renderedTrailing);
  return timeline;
};
