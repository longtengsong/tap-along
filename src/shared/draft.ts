import {
  derivePlainText,
  docFromPlainText,
  parseNoteDoc,
  stripPendingImages,
  type NoteDoc,
} from './note-doc.ts';

export interface DraftSnapshot {
  version: 2;
  doc: NoteDoc;
  source: string;
}

export const DRAFT_STORAGE_KEY = 'tap-along:draft';
export const MAX_DRAFT_LENGTH = 2_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeSnapshot = (
  doc: NoteDoc,
  source: string,
): DraftSnapshot | null => {
  const cleaned = stripPendingImages(doc);

  if (!derivePlainText(cleaned).trim() && !source.trim()) {
    return null;
  }

  const snapshot: DraftSnapshot = { version: 2, doc: cleaned, source };

  return JSON.stringify(snapshot).length > MAX_DRAFT_LENGTH ? null : snapshot;
};

const parseStoredDoc = (value: unknown): NoteDoc | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.version === 2) {
    const result = parseNoteDoc(value.doc);
    return result.ok ? result.doc : null;
  }

  // v1：{ body, source }
  const body = value.body;

  if (typeof body !== 'string') {
    return null;
  }

  return docFromPlainText(body);
};

export const parseDraftSnapshot = (
  value: string | null,
): DraftSnapshot | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!isRecord(parsed) || typeof parsed.source !== 'string') {
      return null;
    }

    const doc = parseStoredDoc(parsed);

    if (!doc) {
      return null;
    }

    return normalizeSnapshot(doc, parsed.source);
  } catch {
    return null;
  }
};

export const loadDraftSnapshot = (
  storage: Pick<Storage, 'getItem'>,
): DraftSnapshot | null => {
  try {
    return parseDraftSnapshot(storage.getItem(DRAFT_STORAGE_KEY));
  } catch {
    return null;
  }
};

export const saveDraftSnapshot = (
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  draft: DraftSnapshot,
): void => {
  try {
    const cleaned = stripPendingImages(draft.doc);

    if (!derivePlainText(cleaned).trim() && !draft.source.trim()) {
      storage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }

    const snapshot: DraftSnapshot = {
      version: 2,
      doc: cleaned,
      source: draft.source,
    };
    const serialized = JSON.stringify(snapshot);

    if (serialized.length > MAX_DRAFT_LENGTH) {
      return;
    }

    storage.setItem(DRAFT_STORAGE_KEY, serialized);
  } catch {
    // 草稿写入失败不应阻断用户继续输入。
  }
};

export const clearDraftSnapshot = (
  storage: Pick<Storage, 'removeItem'>,
): void => {
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // 清除失败不应阻断应用。
  }
};
