import type { AppErrorCode } from './errors.ts';

export const CONTEXT_THOUGHT_KINDS = ['line', 'branch'] as const;

export type ContextThoughtKind = (typeof CONTEXT_THOUGHT_KINDS)[number];

/**
 * 一次会话里真正参与上下文的一颗念头。
 *
 * - line: guidance 接上的旧念头（按接点里的顺序进入）
 * - branch: 从当前页另记、后来合上的念头（按创建时间进入）
 *
 * 当前页本身不在这里，它已经在会话中央的念头卡里。
 */
export interface ContextThought {
  pageId: number;
  title: string;
  source: string;
  body: string;
  kind: ContextThoughtKind;
}

export interface ContextThoughtsPayload {
  pageId: number;
}

export interface ContextThoughtsResult {
  ok: boolean;
  thoughts?: ContextThought[];
  errorCode?: AppErrorCode;
}

export const CONTEXT_CHANNELS = {
  list: 'context:list',
} as const;

export interface ContextBridge {
  listContextThoughts?: (
    payload: ContextThoughtsPayload,
  ) => Promise<ContextThoughtsResult>;
}
