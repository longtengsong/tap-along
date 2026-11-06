import type { IpcMain } from 'electron';
import {
  CONTEXT_CHANNELS,
  type ContextThoughtsResult,
} from '../../shared/context.ts';
import type { PagesRepository } from '../db/pages.ts';
import { listContextThoughts } from '../services/context-thoughts.ts';

const parsePageId = (payload: unknown): number | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const pageId = (payload as { pageId?: unknown }).pageId;

  return typeof pageId === 'number' && Number.isInteger(pageId) && pageId > 0
    ? pageId
    : null;
};

export const registerContextHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  repository: Pick<PagesRepository, 'findById' | 'listClosedDescendantBodies'>,
) => {
  ipcMain.handle(
    CONTEXT_CHANNELS.list,
    (_event, payload: unknown): ContextThoughtsResult => {
      const pageId = parsePageId(payload);

      if (pageId === null) {
        return { ok: false, errorCode: 'INVALID_PAGE_ID' };
      }

      try {
        return { ok: true, thoughts: listContextThoughts(repository, pageId) };
      } catch (error) {
        console.error('读取会话上下文念头失败：', error);
        return { ok: false, errorCode: 'READ_FAILED' };
      }
    },
  );
};
