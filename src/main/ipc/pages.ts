import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type {
  AppendPagePayload,
  ClosePagePayload,
  EditPagePayload,
  ListPagesPayload,
  PageClearAllResult,
  PageListResult,
  PageOperationResult,
  SavePagePayload,
} from '../../shared/pages.ts';
import { PAGE_CHANNELS, TITLE_CHANNELS } from '../../shared/pages.ts';
import { derivePlainText, parseNoteDoc } from '../../shared/note-doc.ts';
import type { PagesRepository } from '../db/pages.ts';
import type { ImageStore } from '../services/image-store.ts';
import { GUIDANCE_CHANNELS } from '../../shared/guidance.ts';
import { createOpeningTeacherMessage } from '../services/teacher.ts';
import type { GuidanceService } from '../services/guidance.ts';
import type { TitleService } from '../services/title-service.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseSavePayload = (
  payload: unknown,
):
  | { ok: true; value: SavePagePayload }
  | {
      ok: false;
      errorCode: 'INVALID_BODY' | 'INVALID_PAGE_ID' | 'INVALID_NOTE_DOC';
    } => {
  if (!isRecord(payload)) {
    return { ok: false, errorCode: 'INVALID_BODY' };
  }

  const parsedDoc =
    payload.doc === undefined ? null : parseNoteDoc(payload.doc);

  if (parsedDoc && !parsedDoc.ok) {
    return { ok: false, errorCode: 'INVALID_NOTE_DOC' };
  }

  const body =
    parsedDoc && parsedDoc.ok
      ? derivePlainText(parsedDoc.doc).trim()
      : typeof payload.body === 'string'
        ? payload.body.trim()
        : '';

  if (!body) {
    return { ok: false, errorCode: 'INVALID_BODY' };
  }

  if (
    payload.parentPageId !== undefined &&
    (typeof payload.parentPageId !== 'number' ||
      !Number.isInteger(payload.parentPageId) ||
      payload.parentPageId <= 0)
  ) {
    return { ok: false, errorCode: 'INVALID_PAGE_ID' };
  }

  return {
    ok: true,
    value: {
      ...(parsedDoc && parsedDoc.ok ? { doc: parsedDoc.doc } : {}),
      body,
      source: typeof payload.source === 'string' ? payload.source.trim() : '',
      ...(typeof payload.parentPageId === 'number'
        ? { parentPageId: payload.parentPageId }
        : {}),
    },
  };
};

const parseListPayload = (
  payload: unknown,
  defaultLimit = 1,
  maxLimit = 20,
): ListPagesPayload | null => {
  if (payload === undefined) {
    return { limit: defaultLimit };
  }

  if (!isRecord(payload)) {
    return null;
  }

  const limit = payload.limit ?? defaultLimit;

  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) {
    return null;
  }

  return { limit: Math.min(limit, maxLimit) };
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

  if (typeof payload.requestId !== 'string' || !payload.requestId.trim()) {
    return { ok: false as const, errorCode: 'MAINTENANCE_FAILED' as const };
  }

  const parsedDoc =
    payload.doc === undefined ? null : parseNoteDoc(payload.doc);

  if (parsedDoc && !parsedDoc.ok) {
    return { ok: false as const, errorCode: 'INVALID_NOTE_DOC' as const };
  }

  const body =
    parsedDoc && parsedDoc.ok
      ? derivePlainText(parsedDoc.doc).trim()
      : typeof payload.body === 'string'
        ? payload.body.trim()
        : '';

  if (!body) {
    return { ok: false as const, errorCode: 'INVALID_BODY' as const };
  }

  return {
    ok: true as const,
    value: {
      pageId: payload.pageId,
      ...(parsedDoc && parsedDoc.ok ? { doc: parsedDoc.doc } : {}),
      body,
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

  if (!input.ok) {
    return { ok: false, errorCode: input.errorCode };
  }

  try {
    const body = input.value.body ?? '';

    return {
      ok: true,
      page: repository.create(
        body,
        input.value.source,
        {
          text: createOpeningTeacherMessage(body),
          requestId: 'opening',
        },
        input.value.parentPageId ?? null,
        input.value.doc,
      ),
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

export const listClosedPages = (
  repository: Pick<PagesRepository, 'listClosed'>,
  payload: unknown,
): PageListResult => {
  const input = parseListPayload(payload, 50, 100);

  if (!input) {
    return { ok: false, errorCode: 'INVALID_LIST_LIMIT' };
  }

  try {
    return {
      ok: true,
      pages: repository.listClosed(input.limit ?? 50),
    };
  } catch (error) {
    console.error('读取旧念头失败：', error);
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
      input.value.doc,
    );

    if (!result.ok) {
      return {
        ok: false,
        errorCode:
          result.reason === 'closed'
            ? 'PAGE_CLOSED'
            : result.reason === 'doc_required'
              ? 'INVALID_NOTE_DOC'
              : 'PAGE_NOT_FOUND',
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

export const clearAllPages = async (
  repository: Pick<PagesRepository, 'clearAll'>,
  imageStore?: Pick<ImageStore, 'clear'>,
): Promise<PageClearAllResult> => {
  try {
    const cleared = repository.clearAll();
    await imageStore?.clear();
    return { ok: true, cleared };
  } catch (error) {
    console.error('清空会话数据失败：', error);
    return { ok: false, errorCode: 'SAVE_FAILED' };
  }
};

export const registerPageHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  repository: PagesRepository,
  guidanceService?: Pick<GuidanceService, 'run'>,
  titleService?: Pick<TitleService, 'run' | 'generate'>,
  imageStore?: Pick<ImageStore, 'clear'>,
) => {
  const emitTitleUpdate = (
    event: IpcMainInvokeEvent | null | undefined,
    pageId: number,
  ) => {
    const sender = event?.sender;

    if (!titleService || !sender) {
      return;
    }

    void titleService
      .run(pageId, (update) => {
        if (!sender.isDestroyed()) {
          sender.send(TITLE_CHANNELS.updated, update);
        }
      })
      .catch((error: unknown) => {
        console.error('触发标题生成失败：', error);
      });
  };

  ipcMain.handle(PAGE_CHANNELS.save, (event, payload: unknown) => {
    const result = savePage(repository, payload);
    const sender = event?.sender;

    if (result.ok && result.page && guidanceService && sender) {
      const pageId = result.page.id;

      void guidanceService
        .run(pageId, (update) => {
          if (!sender.isDestroyed()) {
            sender.send(GUIDANCE_CHANNELS.updated, update);
          }
        })
        .catch((error: unknown) => {
          console.error('触发理解引导失败：', error);
        });
    }

    if (result.ok && result.page) {
      emitTitleUpdate(event, result.page.id);
    }

    return result;
  });
  ipcMain.handle(PAGE_CHANNELS.get, (_event, pageId: unknown) =>
    getPage(repository, pageId),
  );
  ipcMain.handle(PAGE_CHANNELS.list, (_event, payload: unknown) =>
    listPages(repository, payload),
  );
  ipcMain.handle(PAGE_CHANNELS.listClosed, (_event, payload: unknown) =>
    listClosedPages(repository, payload),
  );
  ipcMain.handle(PAGE_CHANNELS.append, (event, payload: unknown) => {
    const result = appendPage(repository, payload);

    if (result.ok && result.page) {
      emitTitleUpdate(event, result.page.id);
    }

    return result;
  });
  ipcMain.handle(PAGE_CHANNELS.edit, (event, payload: unknown) => {
    const result = editPage(repository, payload);

    if (result.ok && result.page) {
      emitTitleUpdate(event, result.page.id);
    }

    return result;
  });
  ipcMain.handle(PAGE_CHANNELS.close, (_event, payload: unknown) =>
    closePage(repository, payload),
  );
  ipcMain.handle(PAGE_CHANNELS.clearAll, () =>
    clearAllPages(repository, imageStore),
  );
  ipcMain.handle(TITLE_CHANNELS.update, (_event, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      !Number.isInteger((payload as { pageId?: unknown }).pageId) ||
      ((payload as { pageId?: number }).pageId ?? 0) <= 0
    ) {
      return { ok: false, errorCode: 'INVALID_PAGE_ID' };
    }

    const title = (payload as { title?: unknown }).title;

    if (typeof title !== 'string' || !title.trim()) {
      return { ok: false, errorCode: 'INVALID_BODY' };
    }

    try {
      const page = repository.updateTitle(
        (payload as { pageId: number }).pageId,
        title,
        'user',
      );

      if (!page) {
        return { ok: false, errorCode: 'PAGE_NOT_FOUND' };
      }

      return { ok: true, title: page.title };
    } catch (error) {
      console.error('保存标题失败：', error);
      return { ok: false, errorCode: 'SAVE_FAILED' };
    }
  });

  ipcMain.handle(TITLE_CHANNELS.generate, async (_event, payload: unknown) => {
    if (!titleService) {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      !Number.isInteger((payload as { pageId?: unknown }).pageId) ||
      ((payload as { pageId?: number }).pageId ?? 0) <= 0
    ) {
      return { ok: false, errorCode: 'INVALID_PAGE_ID' };
    }

    try {
      return await titleService.generate(
        (payload as { pageId: number }).pageId,
      );
    } catch (error) {
      console.error('生成标题失败：', error);
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  });
};
