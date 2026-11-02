export type PageLifecycleStatus = 'reading' | 'closed';

export type ParseStatus = 'pending' | 'reading' | 'done' | 'failed';

export type PageMessageRole = 'teacher' | 'user' | 'maintenance';

export interface PageMessageSnapshot {
  role: PageMessageRole;
  text: string;
  suggestClose?: boolean;
}

export interface PageSnapshot {
  id: number;
  title: string;
  body: string;
  source: string;
  status: PageLifecycleStatus;
  parseStatus: ParseStatus;
  teachingRoundCount: number;
  messages: PageMessageSnapshot[];
}

export interface SavePagePayload {
  body: string;
  source: string;
}

export interface PageOperationResult {
  ok: boolean;
  page?: PageSnapshot;
  error?: string;
}

export const PAGE_CHANNELS = {
  save: 'pages:save',
  get: 'pages:get',
} as const;

export interface TapAlongBridge {
  savePage?: (payload: SavePagePayload) => Promise<PageOperationResult>;
  getPage?: (pageId: number) => Promise<PageOperationResult>;
  editPage?: (pageId: number, body: string) => Promise<PageOperationResult>;
  appendPage?: (pageId: number, body: string) => Promise<PageOperationResult>;
  closePage?: (pageId: number) => Promise<{ ok: boolean }>;
}
