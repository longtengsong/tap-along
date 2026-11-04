export interface DraftSnapshot {
  body: string;
  source: string;
}

export const DRAFT_STORAGE_KEY = 'tap-along:draft';
export const MAX_DRAFT_LENGTH = 100_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const parseDraftSnapshot = (
  value: string | null,
): DraftSnapshot | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!isRecord(parsed)) {
      return null;
    }

    const { body, source } = parsed;

    if (typeof body !== 'string' || typeof source !== 'string') {
      return null;
    }

    if (!body.trim() && !source.trim()) {
      return null;
    }

    if (body.length + source.length > MAX_DRAFT_LENGTH) {
      return null;
    }

    return { body, source };
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
    if (!draft.body.trim() && !draft.source.trim()) {
      storage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }

    if (draft.body.length + draft.source.length > MAX_DRAFT_LENGTH) {
      return;
    }

    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
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
