import type { AppErrorCode } from '@/shared/errors';
import type { GuidanceView } from '@/shared/guidance';
import type { NoteDoc } from '@/shared/note-doc';
import type { TeacherSource } from '@/shared/search';

export type PageStatus = 'reading' | 'closed' | 'saving' | 'failed';

export type MessageRole = 'teacher' | 'user' | 'maintenance';

export type OverlayState =
  | 'saving'
  | 'failed'
  | 'teacher-no-response'
  | 'search-unavailable'
  | null;

export type ComposerMode = 'normal' | 'append';

export interface TalkMessage {
  id: string;
  role: MessageRole;
  text: string;
  suggestClose?: boolean;
  requestId?: string;
  mode?: 'reflect' | 'answer';
  sources?: TeacherSource[];
  citationStatus?: 'cited' | 'uncited';
  researchSkipped?: boolean;
}

export interface RetryableTurn {
  pageId: number;
  messageId: string;
  errorCode?: AppErrorCode | null;
}

export interface PageRecord {
  id: number;
  /** 另起这一页时的父页编号；为空表示从应用最外层新建。 */
  parentPageId?: number | null;
  title: string;
  body: string;
  doc?: NoteDoc;
  source: string;
  status: PageStatus;
  messages: TalkMessage[];
  teacherTurn: number;
  guidance?: GuidanceView;
  guidanceError?: string;
  pendingGuidanceRefresh?: boolean;
  editing: boolean;
  editDoc?: NoteDoc;
  historyOpen: boolean;
  suggestClose: boolean;
  titleGenerating?: boolean;
  titleEditing?: boolean;
  titleSaving?: boolean;
  titleError?: string;
}

export interface PageDraft {
  doc: NoteDoc;
  source: string;
}
