import type {
  PageSnapshot,
  PageClearAllResult,
  PageTitleUpdatedEvent,
  SavePagePayload,
  TapAlongBridge,
  TeacherAskPayload,
  TeacherCancelPayload,
  TeacherCancelResult,
  TeacherChunkEvent,
  TeacherDoneEvent,
  TeacherMaintenancePayload,
  TeacherRequestInspectionResult,
  TeacherResumePayload,
  TeacherStartResult,
} from '@/shared/pages';
import type { AppErrorCode } from '@/shared/errors';
import type { ExportBackupResult } from '@/shared/backup';
import type {
  GuidanceRunPayload,
  GuidanceRunResult,
  GuidanceUpdatedEvent,
  GuidanceUsePayload,
  GuidanceUseResult,
} from '@/shared/guidance';
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

interface PageUiListResult {
  ok: boolean;
  pages?: PageRecord[];
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
              : message.actionType === 'forked'
                ? i18n.global.t('messages.newPage')
                : message.text,
      suggestClose: message.suggestClose,
      requestId: message.requestId,
      ...(message.mode ? { mode: message.mode } : {}),
      ...(message.sources ? { sources: message.sources } : {}),
      ...(message.sources
        ? {
            citationStatus: /\[\d+\]/.test(message.text)
              ? ('cited' as const)
              : ('uncited' as const),
          }
        : {}),
    })),
    teacherTurn: page.teachingRoundCount,
    guidance: page.guidance,
    guidanceError: '',
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
  guidanceError: '',
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

  supportsTeacherCancellation: () => Boolean(bridge?.cancelTeacher),

  supportsGuidance: () =>
    Boolean(bridge?.useGuidanceSuggestion && bridge?.onGuidanceUpdated),

  supportsGuidanceRefresh: () => Boolean(bridge?.runGuidance),

  async runGuidance(payload: GuidanceRunPayload): Promise<GuidanceRunResult> {
    if (!bridge?.runGuidance) {
      return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
    }

    return bridge.runGuidance(payload);
  },

  async useGuidanceSuggestion(
    payload: GuidanceUsePayload,
  ): Promise<GuidanceUseResult> {
    if (!bridge?.useGuidanceSuggestion) {
      return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
    }

    return bridge.useGuidanceSuggestion(payload);
  },

  onGuidanceUpdated(callback: (event: GuidanceUpdatedEvent) => void) {
    return bridge?.onGuidanceUpdated?.(callback) ?? (() => {});
  },

  supportsTitleUpdates: () => Boolean(bridge?.onPageTitleUpdated),

  onPageTitleUpdated(callback: (event: PageTitleUpdatedEvent) => void) {
    return bridge?.onPageTitleUpdated?.(callback) ?? (() => {});
  },

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

  async cancelTeacher(
    payload: TeacherCancelPayload,
  ): Promise<TeacherCancelResult> {
    if (!bridge?.cancelTeacher) {
      return { ok: true };
    }

    return bridge.cancelTeacher(payload);
  },

  onTeacherChunk(callback: (event: TeacherChunkEvent) => void) {
    return bridge?.onTeacherChunk?.(callback) ?? (() => {});
  },

  onTeacherDone(callback: (event: TeacherDoneEvent) => void) {
    return bridge?.onTeacherDone?.(callback) ?? (() => {});
  },

  async inspectTeacherRequest(
    requestId: string,
  ): Promise<TeacherRequestInspectionResult> {
    return bridge?.inspectTeacherRequest
      ? bridge.inspectTeacherRequest(requestId)
      : { ok: false, errorCode: 'DEVELOPER_MODE_REQUIRED' };
  },

  async openExternal(url: string) {
    if (!bridge?.openExternal) {
      return { ok: false, errorCode: 'EXTERNAL_URL_INVALID' as const };
    }

    return bridge.openExternal(url);
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

  async listClosedPages(limit = 50): Promise<PageUiListResult> {
    if (!bridge?.listClosedPages) {
      return { ok: true, pages: [] };
    }

    const response = await bridge.listClosedPages({ limit });

    return {
      ok: response.ok,
      ...(response.pages ? { pages: response.pages.map(toPageRecord) } : {}),
      ...(response.errorCode ? { errorCode: response.errorCode } : {}),
    };
  },

  async exportBackup(): Promise<ExportBackupResult> {
    if (!bridge?.exportBackup) {
      return { ok: false, errorCode: 'EXPORT_FAILED' };
    }

    return bridge.exportBackup();
  },

  async clearAllPages(): Promise<PageClearAllResult> {
    if (bridge?.clearAllPages) {
      return bridge.clearAllPages();
    }

    return { ok: true, cleared: 0 };
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
