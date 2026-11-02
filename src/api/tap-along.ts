import type {
  PageSnapshot,
  SavePagePayload,
  TapAlongBridge,
  TeacherAskPayload,
  TeacherChunkEvent,
  TeacherDoneEvent,
  TeacherMaintenancePayload,
  TeacherResumePayload,
  TeacherStartResult,
} from '@/shared/pages';
import type { AppErrorCode } from '@/shared/errors';
import { i18n } from '@/i18n';
import { translateFixedMessage } from '@/i18n/fixed-messages';
import {
  extractContentKeyword,
  resolveMockReplyLanguage,
} from '@/shared/conversation-language';
import type { PageRecord } from '@/types/session';

interface PageUiResult {
  ok: boolean;
  page?: PageRecord;
  errorCode?: AppErrorCode;
}

const wait = (duration: number) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

const bridge = (window as Window & { tapAlong?: TapAlongBridge }).tapAlong;

let mockPageId = Date.now();

export const extractKeyword = (body: string) => extractContentKeyword(body);

const toPageRecord = (page: PageSnapshot): PageRecord => {
  const userTexts = page.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.text);
  const closeLanguage = resolveMockReplyLanguage(
    userTexts.at(-1) ?? page.body,
    [page.body, ...userTexts.slice(0, -1)],
  );

  return {
    id: page.id,
    title: page.title,
    body: page.body,
    source: page.source,
    status: page.status,
    messages: page.messages.map((message, index) => ({
      id: `saved-${page.id}-${index}`,
      role: message.role,
      text:
        message.actionType === 'appended_note'
          ? i18n.global.t('messages.appended', {
              content: message.content ?? '',
            })
          : message.actionType === 'edited_note'
            ? i18n.global.t('messages.edited')
            : message.actionType === 'end'
              ? translateFixedMessage(
                  closeLanguage,
                  'teacherFallback.userClosed',
                )
              : message.text,
      suggestClose: message.suggestClose,
    })),
    teacherTurn: page.teachingRoundCount,
    editing: false,
    editDraft: page.body,
    historyOpen: false,
    suggestClose: Boolean(page.messages.at(-1)?.suggestClose),
  };
};

const createMockPage = ({ body, source }: SavePagePayload): PageRecord => ({
  id: (mockPageId += 1),
  title: extractKeyword(body),
  body,
  source,
  status: 'reading',
  messages: [],
  teacherTurn: 0,
  editing: false,
  editDraft: body,
  historyOpen: false,
  suggestClose: false,
});

export const tapAlongApi = {
  supportsTeacherStreaming: () =>
    Boolean(
      bridge?.askTeacher && bridge?.onTeacherChunk && bridge?.onTeacherDone,
    ),

  supportsTeacherResume: () =>
    Boolean(
      bridge?.resumeTeacher && bridge?.onTeacherChunk && bridge?.onTeacherDone,
    ),

  supportsTeacherMaintenance: () =>
    Boolean(
      bridge?.maintainTeacher &&
      bridge?.onTeacherChunk &&
      bridge?.onTeacherDone,
    ),

  async askTeacher(payload: TeacherAskPayload): Promise<TeacherStartResult> {
    if (!bridge?.askTeacher) {
      return { ok: false, errorCode: 'TEACHER_NO_RESPONSE' };
    }

    return bridge.askTeacher(payload);
  },

  async resumeTeacher(
    payload: TeacherResumePayload,
  ): Promise<TeacherStartResult> {
    if (!bridge?.resumeTeacher) {
      return { ok: false, errorCode: 'TEACHER_NO_RESPONSE' };
    }

    return bridge.resumeTeacher(payload);
  },

  async maintainTeacher(
    payload: TeacherMaintenancePayload,
  ): Promise<TeacherStartResult> {
    if (!bridge?.maintainTeacher) {
      return { ok: false, errorCode: 'TEACHER_NO_RESPONSE' };
    }

    return bridge.maintainTeacher(payload);
  },

  onTeacherChunk(callback: (event: TeacherChunkEvent) => void) {
    return bridge?.onTeacherChunk?.(callback) ?? (() => {});
  },

  onTeacherDone(callback: (event: TeacherDoneEvent) => void) {
    return bridge?.onTeacherDone?.(callback) ?? (() => {});
  },

  async savePage(input: SavePagePayload): Promise<PageUiResult> {
    if (bridge?.savePage) {
      const response = await bridge.savePage(input);
      return {
        ...response,
        page: response.page ? toPageRecord(response.page) : undefined,
      };
    }

    await wait(760);
    return { ok: true, page: createMockPage(input) };
  },

  async getPage(pageId: number): Promise<PageRecord | null> {
    if (!bridge?.getPage) {
      return null;
    }

    const response = await bridge.getPage(pageId);
    return response.ok && response.page ? toPageRecord(response.page) : null;
  },

  async listRecentPages(limit = 1): Promise<PageRecord[]> {
    if (!bridge?.listPages) {
      return [];
    }

    const response = await bridge.listPages({ limit });
    return response.ok && response.pages
      ? response.pages.map(toPageRecord)
      : [];
  },

  async editPage(
    pageId: number,
    body: string,
    requestId: string,
  ): Promise<PageUiResult> {
    if (bridge?.editPage) {
      const response = await bridge.editPage({ pageId, body, requestId });
      return {
        ...response,
        page: response.page ? toPageRecord(response.page) : undefined,
      };
    }

    await wait(320);
    return { ok: true };
  },

  async appendPage(
    pageId: number,
    body: string,
    requestId: string,
  ): Promise<PageUiResult> {
    if (bridge?.appendPage) {
      const response = await bridge.appendPage({
        pageId,
        content: body,
        requestId,
      });
      return {
        ...response,
        page: response.page ? toPageRecord(response.page) : undefined,
      };
    }

    await wait(320);
    return { ok: true };
  },

  async closePage(pageId: number, requestId: string): Promise<PageUiResult> {
    if (bridge?.closePage) {
      const response = await bridge.closePage({ pageId, requestId });
      return {
        ...response,
        page: response.page ? toPageRecord(response.page) : undefined,
      };
    }

    await wait(320);
    return { ok: true };
  },
};
