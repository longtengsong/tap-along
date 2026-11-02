import type { IpcMain } from 'electron';
import type {
  AppendPagePayload,
  ClosePagePayload,
  EditPagePayload,
  ListPagesPayload,
  PageListResult,
  PageOperationResult,
  SavePagePayload,
} from '../../shared/pages.ts';
import { PAGE_CHANNELS } from '../../shared/pages.ts';
import type { PagesRepository } from '../db/pages.ts';
import { createOpeningTeacherMessage } from '../services/teacher.ts';

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

const parseEditPayload = (payload: unknown) => {
  if (
    !isRecord(payload) ||
    typeof payload.pageId !== 'number' ||
    !Number.isInteger(payload.pageId) ||
    payload.pageId <= 0
  ) {
    return { ok: false as const, errorCode: 'INVALID_PAGE_ID' as const };
  }

  if (typeof payload.body !== 'string' || !payload.body.trim()) {
    return { ok: false as const, errorCode: 'INVALID_BODY' as const };
  }

  if (typeof payload.requestId !== 'string' || !payload.requestId.trim()) {
    return { ok: false as const, errorCode: 'MAINTENANCE_FAILED' as const };
  }

  return {
    ok: true as const,
    value: {
      pageId: payload.pageId,
      body: payload.body.trim(),
      requestId: payload.requestId.trim(),
    } satisfies EditPagePayload,
  };
};

const parseClosePayload = (payload: unknown) => {
  if (
    !isRecord(payload) ||
    typeof payload.pageId !== 'number' ||
    !Number.isInteger(payload.pageId) ||
    payload.pageId <= 0
  ) {
    return { ok: false as const, errorCode: 'INVALID_PAGE_ID' as const };
  }

  if (typeof payload.requestId !== 'string' || !payload.requestId.trim()) {
    return { ok: false as const, errorCode: 'MAINTENANCE_FAILED' as const };
  }

  return {
    ok: true as const,
    value: {
      pageId: payload.pageId,
      requestId: payload.requestId.trim(),
    } satisfies ClosePagePayload,
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
      page: repository.create(input.body, input.source, {
        text: createOpeningTeacherMessage(input.body),
        requestId: 'opening',
      }),
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

export const editPage = (
  repository: Pick<PagesRepository, 'editText'>,
  payload: unknown,
): PageOperationResult => {
  const input = parseEditPayload(payload);

  if (!input.ok) {
    return { ok: false, errorCode: input.errorCode };
  }

  try {
    const result = repository.editText(
      input.value.pageId,
      input.value.body,
      input.value.requestId,
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
    console.error('改批注失败：', error);
    return { ok: false, errorCode: 'MAINTENANCE_FAILED' };
  }
};

export const closePage = (
  repository: Pick<PagesRepository, 'closePage'>,
  payload: unknown,
): PageOperationResult => {
  const input = parseClosePayload(payload);

  if (!input.ok) {
    return { ok: false, errorCode: input.errorCode };
  }

  try {
    const result = repository.closePage(
      input.value.pageId,
      input.value.requestId,
    );

    if (!result.ok) {
      return { ok: false, errorCode: 'PAGE_NOT_FOUND' };
    }

    return { ok: true, page: result.page };
  } catch (error) {
    console.error('合上页面失败：', error);
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
  ipcMain.handle(PAGE_CHANNELS.edit, (_event, payload: unknown) =>
    editPage(repository, payload),
  );
  ipcMain.handle(PAGE_CHANNELS.close, (_event, payload: unknown) =>
    closePage(repository, payload),
  );
};
