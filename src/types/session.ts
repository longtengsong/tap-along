export type PageStatus = 'reading' | 'closed' | 'saving' | 'failed';

export type MessageRole = 'teacher' | 'user' | 'maintenance';

export type OverlayState = 'saving' | 'failed' | 'teacher-no-response' | null;

export type ComposerMode = 'normal' | 'append';

export interface TalkMessage {
  id: string;
  role: MessageRole;
  text: string;
  suggestClose?: boolean;
}

export interface PageRecord {
  id: number;
  title: string;
  body: string;
  source: string;
  status: PageStatus;
  messages: TalkMessage[];
  teacherTurn: number;
  editing: boolean;
  editDraft: string;
  historyOpen: boolean;
  suggestClose: boolean;
}

export interface PageDraft {
  body: string;
  source: string;
}
