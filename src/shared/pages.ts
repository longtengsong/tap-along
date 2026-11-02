export type PageLifecycleStatus = 'reading' | 'closed';

export type ParseStatus = 'pending' | 'reading' | 'done' | 'failed';

export type PageMessageRole = 'teacher' | 'user' | 'maintenance';

export interface PageMessageSnapshot {
  role: PageMessageRole;
  text: string;
  suggestClose?: boolean;
  requestId?: string;
  createdAt?: number;
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

export interface ListPagesPayload {
  limit?: number;
}

export interface PageOperationResult {
  ok: boolean;
  page?: PageSnapshot;
  error?: string;
}

export interface PageListResult {
  ok: boolean;
  pages?: PageSnapshot[];
  error?: string;
}

export const PAGE_CHANNELS = {
  save: 'pages:save',
  get: 'pages:get',
  list: 'pages:list',
} as const;

export interface TeacherAskPayload {
  pageId: number;
  userText: string;
  requestId: string;
}

export interface TeacherStartResult {
  ok: boolean;
  requestId?: string;
  error?: string;
}

export interface TeacherChunkEvent {
  pageId: number;
  requestId: string;
  chunk: string;
}

export interface TeacherDoneEvent {
  ok: boolean;
  pageId: number;
  requestId: string;
  reply?: string;
  suggestClose?: boolean;
  error?: string;
}

export const TEACHER_CHANNELS = {
  ask: 'teacher:ask',
  chunk: 'teacher:chunk',
  done: 'teacher:done',
} as const;

export interface TapAlongBridge {
  savePage?: (payload: SavePagePayload) => Promise<PageOperationResult>;
  getPage?: (pageId: number) => Promise<PageOperationResult>;
  listPages?: (payload: ListPagesPayload) => Promise<PageListResult>;
  editPage?: (pageId: number, body: string) => Promise<PageOperationResult>;
  appendPage?: (pageId: number, body: string) => Promise<PageOperationResult>;
  closePage?: (pageId: number) => Promise<{ ok: boolean }>;
  askTeacher?: (payload: TeacherAskPayload) => Promise<TeacherStartResult>;
  onTeacherChunk?: (callback: (event: TeacherChunkEvent) => void) => () => void;
  onTeacherDone?: (callback: (event: TeacherDoneEvent) => void) => () => void;
}
