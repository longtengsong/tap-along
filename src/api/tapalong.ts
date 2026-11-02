import type { PageRecord } from '@/types/session';

interface SavePageRequest {
  body: string;
  source: string;
}

interface SavePageResponse {
  ok: boolean;
  page?: PageRecord;
  error?: string;
}

interface TapAlongBridge {
  savePage?: (input: SavePageRequest) => Promise<SavePageResponse>;
  editPage?: (
    pageId: string,
    body: string,
  ) => Promise<{ ok: boolean; page?: PageRecord }>;
  appendPage?: (
    pageId: string,
    body: string,
  ) => Promise<{ ok: boolean; page?: PageRecord }>;
  closePage?: (pageId: string) => Promise<{ ok: boolean }>;
}

const wait = (duration: number) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

const bridge = (window as Window & { tapalong?: TapAlongBridge }).tapalong;

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const extractKeyword = (body: string) => {
  const firstLine = body.split('\n')[0]?.trim() ?? '';
  const clean = firstLine.replace(/[，。、；：“”‘’？！\s]/g, '');

  return clean.slice(0, 6) || '这页';
};

const createMockPage = ({ body, source }: SavePageRequest): PageRecord => ({
  id: createId(),
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
  async savePage(input: SavePageRequest): Promise<SavePageResponse> {
    if (bridge?.savePage) {
      return bridge.savePage(input);
    }

    await wait(760);
    return { ok: true, page: createMockPage(input) };
  },

  async editPage(pageId: string, body: string): Promise<PageRecord | null> {
    if (bridge?.editPage) {
      const response = await bridge.editPage(pageId, body);
      return response.page ?? null;
    }

    await wait(320);
    return null;
  },

  async appendPage(pageId: string, body: string): Promise<PageRecord | null> {
    if (bridge?.appendPage) {
      const response = await bridge.appendPage(pageId, body);
      return response.page ?? null;
    }

    await wait(320);
    return null;
  },

  async closePage(pageId: string): Promise<void> {
    await bridge?.closePage?.(pageId);
  },
};
