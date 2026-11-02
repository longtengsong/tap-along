import type {
  PageSnapshot,
  SavePagePayload,
  TapAlongBridge,
  TeacherAskPayload,
  TeacherChunkEvent,
  TeacherDoneEvent,
  TeacherStartResult,
} from '@/shared/pages';
import type { PageRecord } from '@/types/session';

interface PageUiResult {
  ok: boolean;
  page?: PageRecord;
  error?: string;
}

const wait = (duration: number) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

const bridge = (window as Window & { tapAlong?: TapAlongBridge }).tapAlong;

let mockPageId = Date.now();

export const extractKeyword = (body: string) => {
  const firstLine = body.split('\n')[0]?.trim() ?? '';
  const clean = firstLine.replace(/[，。、；：“”‘’？！\s]/g, '');

  return clean.slice(0, 6) || '这页';
};

const toPageRecord = (page: PageSnapshot): PageRecord => ({
  id: page.id,
  title: page.title,
  body: page.body,
  source: page.source,
  status: page.status,
  messages: page.messages.map((message, index) => ({
    id: `saved-${page.id}-${index}`,
    role: message.role,
    text: message.text,
    suggestClose: message.suggestClose,
  })),
  teacherTurn: page.teachingRoundCount,
  editing: false,
  editDraft: page.body,
  historyOpen: false,
  suggestClose: false,
});

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

  async askTeacher(payload: TeacherAskPayload): Promise<TeacherStartResult> {
    if (!bridge?.askTeacher) {
      return { ok: false, error: '当前环境不支持老师回应。' };
    }

    return bridge.askTeacher(payload);
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

  async editPage(pageId: number, body: string): Promise<PageRecord | null> {
    if (bridge?.editPage) {
      const response = await bridge.editPage(pageId, body);
      return response.page ? toPageRecord(response.page) : null;
    }

    await wait(320);
    return null;
  },

  async appendPage(pageId: number, body: string): Promise<PageRecord | null> {
    if (bridge?.appendPage) {
      const response = await bridge.appendPage(pageId, body);
      return response.page ? toPageRecord(response.page) : null;
    }

    await wait(320);
    return null;
  },

  async closePage(pageId: number): Promise<void> {
    await bridge?.closePage?.(pageId);
  },
};
