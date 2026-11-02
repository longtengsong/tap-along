import type { IpcMain } from 'electron';
import type {
  AppendPagePayload,
  ListPagesPayload,
  PageListResult,
  PageOperationResult,
  SavePagePayload,
} from '../../shared/pages.ts';
import { PAGE_CHANNELS } from '../../shared/pages.ts';
import type { PagesRepository } from '../db/pages.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseSavePayload = (payload: unknown): SavePagePayload | null => {
  if (!isRecord(payload) || typeof payload.body !== 'string') {
    return null;
  }

  const body = payload.body.trim();

  if (!body) {
    return null;
  }

  return {
    body,
    source: typeof payload.source === 'string' ? payload.source.trim() : '',
  };
};

const parseListPayload = (payload: unknown): ListPagesPayload | null => {
  if (payload === undefined) {
    return { limit: 1 };
  }

  if (!isRecord(payload)) {
    return null;
  }

  const limit = payload.limit ?? 1;

  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) {
    return null;
  }

  return { limit: Math.min(limit, 20) };
};

const parseAppendPayload = (payload: unknown): AppendPagePayload | null => {
  if (
    !isRecord(payload) ||
    typeof payload.pageId !== 'number' ||
    !Number.isInteger(payload.pageId) ||
    payload.pageId <= 0 ||
    typeof payload.content !== 'string' ||
    !payload.content.trim() ||
    typeof payload.requestId !== 'string' ||
    !payload.requestId.trim()
  ) {
    return null;
  }

  return {
    pageId: payload.pageId,
    content: payload.content.trim(),
    requestId: payload.requestId.trim(),
  };
};

export const savePage = (
  repository: Pick<PagesRepository, 'create'>,
  payload: unknown,
): PageOperationResult => {
  const input = parseSavePayload(payload);

  if (!input) {
    return { ok: false, errorCode: 'INVALID_BODY' };
  }

  try {
    return {
      ok: true,
      page: repository.create(input.body, input.source),
    };
  } catch (error) {
    console.error('保存页边失败：', error);
    return { ok: false, errorCode: 'SAVE_FAILED' };
  }
};

export const getPage = (
  repository: Pick<PagesRepository, 'findById'>,
  pageId: unknown,
): PageOperationResult => {
  if (typeof pageId !== 'number' || !Number.isInteger(pageId) || pageId <= 0) {
    return { ok: false, errorCode: 'INVALID_PAGE_ID' };
  }

  try {
    const page = repository.findById(pageId);

    if (!page) {
      return { ok: false, errorCode: 'PAGE_NOT_FOUND' };
    }

    return { ok: true, page };
  } catch (error) {
    console.error('读取页边失败：', error);
    return { ok: false, errorCode: 'READ_FAILED' };
  }
};

export const listPages = (
  repository: Pick<PagesRepository, 'listRecentReading'>,
  payload: unknown,
): PageListResult => {
  const input = parseListPayload(payload);

  if (!input) {
    return { ok: false, errorCode: 'INVALID_LIST_LIMIT' };
  }

  try {
    return {
      ok: true,
      pages: repository.listRecentReading(input.limit ?? 1),
    };
  } catch (error) {
    console.error('读取最近页边失败：', error);
    return { ok: false, errorCode: 'LIST_FAILED' };
  }
};

export const appendPage = (
  repository: Pick<PagesRepository, 'appendText'>,
  payload: unknown,
): PageOperationResult => {
  const input = parseAppendPayload(payload);

  if (!input) {
    return { ok: false, errorCode: 'MAINTENANCE_FAILED' };
  }

  try {
    const result = repository.appendText(
      input.pageId,
      input.content,
      input.requestId,
    );

    if (!result.ok) {
      return {
        ok: false,
        errorCode:
          result.reason === 'closed' ? 'PAGE_CLOSED' : 'PAGE_NOT_FOUND',
      };
    }

    return { ok: true, page: result.page };
  } catch (error) {
    console.error('补一句失败：', error);
    return { ok: false, errorCode: 'MAINTENANCE_FAILED' };
  }
};

export const registerPageHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  repository: PagesRepository,
) => {
  ipcMain.handle(PAGE_CHANNELS.save, (_event, payload: unknown) =>
    savePage(repository, payload),
  );
  ipcMain.handle(PAGE_CHANNELS.get, (_event, pageId: unknown) =>
    getPage(repository, pageId),
  );
  ipcMain.handle(PAGE_CHANNELS.list, (_event, payload: unknown) =>
    listPages(repository, payload),
  );
  ipcMain.handle(PAGE_CHANNELS.append, (_event, payload: unknown) =>
    appendPage(repository, payload),
  );
};
