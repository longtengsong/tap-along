import type { IpcMain } from 'electron';
import type {
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

export const savePage = (
  repository: Pick<PagesRepository, 'create'>,
  payload: unknown,
): PageOperationResult => {
  const input = parseSavePayload(payload);

  if (!input) {
    return { ok: false, error: '正文不能为空。' };
  }

  try {
    return {
      ok: true,
      page: repository.create(input.body, input.source),
    };
  } catch (error) {
    console.error('保存页边失败：', error);
    return { ok: false, error: '这一句没送进去。' };
  }
};

export const getPage = (
  repository: Pick<PagesRepository, 'findById'>,
  pageId: unknown,
): PageOperationResult => {
  if (typeof pageId !== 'number' || !Number.isInteger(pageId) || pageId <= 0) {
    return { ok: false, error: '页边编号无效。' };
  }

  try {
    const page = repository.findById(pageId);

    if (!page) {
      return { ok: false, error: '这一页没有找到。' };
    }

    return { ok: true, page };
  } catch (error) {
    console.error('读取页边失败：', error);
    return { ok: false, error: '这一页暂时打不开。' };
  }
};

export const listPages = (
  repository: Pick<PagesRepository, 'listRecentReading'>,
  payload: unknown,
): PageListResult => {
  const input = parseListPayload(payload);

  if (!input) {
    return { ok: false, error: '列表参数无效。' };
  }

  try {
    return {
      ok: true,
      pages: repository.listRecentReading(input.limit ?? 1),
    };
  } catch (error) {
    console.error('读取最近页边失败：', error);
    return { ok: false, error: '最近页边暂时打不开。' };
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
};
