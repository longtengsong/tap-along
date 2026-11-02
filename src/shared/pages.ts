import type { AppErrorCode } from './errors.ts';

export type PageLifecycleStatus = 'reading' | 'closed';

export type ParseStatus = 'pending' | 'reading' | 'done' | 'failed';

export type PageMessageRole = 'teacher' | 'user' | 'maintenance';

export type PageActionType =
  | 'edited_note'
  | 'appended_note'
  | 'end'
  | 'reopened';

export interface PageMessageSnapshot {
  role: PageMessageRole;
  text: string;
  actionType?: PageActionType;
  content?: string;
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

export interface AppendPagePayload {
  pageId: number;
  content: string;
  requestId: string;
}

export interface EditPagePayload {
  pageId: number;
  body: string;
  requestId: string;
}

export interface ListPagesPayload {
  limit?: number;
}

export interface PageOperationResult {
  ok: boolean;
  page?: PageSnapshot;
  errorCode?: AppErrorCode;
}

export interface PageListResult {
  ok: boolean;
  pages?: PageSnapshot[];
  errorCode?: AppErrorCode;
}

export const PAGE_CHANNELS = {
  save: 'pages:save',
  get: 'pages:get',
  list: 'pages:list',
  append: 'pages:append',
  edit: 'pages:edit',
} as const;

export interface TeacherAskPayload {
  pageId: number;
  userText: string;
  requestId: string;
}

export interface TeacherStartResult {
  ok: boolean;
  requestId?: string;
  errorCode?: AppErrorCode;
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
  errorCode?: AppErrorCode;
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
  editPage?: (payload: EditPagePayload) => Promise<PageOperationResult>;
  appendPage?: (payload: AppendPagePayload) => Promise<PageOperationResult>;
  closePage?: (pageId: number) => Promise<{ ok: boolean }>;
  askTeacher?: (payload: TeacherAskPayload) => Promise<TeacherStartResult>;
  onTeacherChunk?: (callback: (event: TeacherChunkEvent) => void) => () => void;
  onTeacherDone?: (callback: (event: TeacherDoneEvent) => void) => () => void;
}
