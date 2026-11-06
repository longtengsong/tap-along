import type { AppErrorCode } from './errors.ts';

export const GUIDANCE_STATUSES = [
  'pending',
  'needed',
  'not_needed',
  'no_candidates',
  'failed',
] as const;

export type GuidanceStatus = (typeof GUIDANCE_STATUSES)[number];

export const GUIDANCE_RELATED_NOTE_EXCERPT_LIMIT = 1200;

export interface GuidanceRelatedNote {
  pageId: number;
  title: string;
  source: string;
  /** 旧念头正文摘录；对谈继续时用它把这条线留在模型眼前。 */
  excerpt?: string;
}

export interface GuidanceSuggestion {
  id: string;
  /**
   * 这条接点串起来的旧念头，按问题里引用的顺序排列。
   * 标题与出处由主进程从候选页填充，不信模型。
   */
  relatedPageIds: number[];
  notes: GuidanceRelatedNote[];
  why: string;
  question: string;
  /** 生成这个问题的那次模型请求；旧数据没有，回退到 guidance-${id}。 */
  requestId?: string;
  anchorQuote?: string;
  used?: boolean;
}

export interface GuidanceView {
  status: GuidanceStatus;
  reason?: string;
  suggestions: GuidanceSuggestion[];
  bodyHash: string;
  updatedAt: number;
}

export const GUIDANCE_CHANNELS = {
  updated: 'guidance:updated',
  use: 'guidance:use',
  run: 'guidance:run',
} as const;

export interface GuidanceUpdatedEvent {
  pageId: number;
  guidance: GuidanceView;
}

export interface GuidanceUsePayload {
  pageId: number;
  suggestionId: string;
}

export interface GuidanceRunPayload {
  pageId: number;
  mode: 'refresh' | 'retry' | 'open';
}

export interface GuidanceRunResult {
  ok: boolean;
  errorCode?: AppErrorCode;
}

export interface GuidanceUseResult {
  ok: boolean;
  question?: string;
  guidance?: GuidanceView;
  errorCode?: AppErrorCode;
}

export interface GuidanceBridge {
  useGuidanceSuggestion?: (
    payload: GuidanceUsePayload,
  ) => Promise<GuidanceUseResult>;
  runGuidance?: (payload: GuidanceRunPayload) => Promise<GuidanceRunResult>;
  onGuidanceUpdated?: (
    callback: (event: GuidanceUpdatedEvent) => void,
  ) => () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isGuidanceStatus = (value: unknown): value is GuidanceStatus =>
  typeof value === 'string' &&
  GUIDANCE_STATUSES.includes(value as GuidanceStatus);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const parseRelatedNote = (value: unknown): GuidanceRelatedNote | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { pageId, title, source, excerpt } = value;

  if (
    !isPositiveInteger(pageId) ||
    typeof title !== 'string' ||
    !title.trim() ||
    typeof source !== 'string'
  ) {
    return null;
  }

  return {
    pageId,
    title,
    source,
    ...(typeof excerpt === 'string' && excerpt.trim()
      ? {
          excerpt: excerpt.trim().slice(0, GUIDANCE_RELATED_NOTE_EXCERPT_LIMIT),
        }
      : {}),
  };
};

/**
 * 旧版本每个接点只连一页（relatedPageId/title/source）。
 * 这里同时接受旧结构，让升级前的引导结果仍能正常展示。
 */
const parseSuggestion = (value: unknown): GuidanceSuggestion | null => {
  if (!isRecord(value)) {
    return null;
  }

  const {
    id,
    relatedPageIds,
    notes,
    relatedPageId,
    title,
    source,
    why,
    question,
    requestId,
    anchorQuote,
    used,
  } = value;

  if (
    typeof id !== 'string' ||
    !id.trim() ||
    typeof why !== 'string' ||
    typeof question !== 'string'
  ) {
    return null;
  }

  const ids = Array.isArray(relatedPageIds)
    ? relatedPageIds.filter(isPositiveInteger)
    : isPositiveInteger(relatedPageId)
      ? [relatedPageId]
      : [];

  if (ids.length === 0 || ids.length > 4 || new Set(ids).size !== ids.length) {
    return null;
  }

  const parsedNotes = Array.isArray(notes)
    ? notes.flatMap((note) => {
        const parsed = parseRelatedNote(note);
        return parsed ? [parsed] : [];
      })
    : [];

  const orderedNotes = ids.flatMap((pageId) => {
    const note = parsedNotes.find((entry) => entry.pageId === pageId);
    return note ? [note] : [];
  });

  if (
    orderedNotes.length !== ids.length &&
    ids.length === 1 &&
    typeof title === 'string' &&
    title.trim() &&
    typeof source === 'string'
  ) {
    orderedNotes.push({ pageId: ids[0], title, source });
  }

  if (orderedNotes.length !== ids.length) {
    return null;
  }

  return {
    id,
    relatedPageIds: ids,
    notes: orderedNotes,
    why,
    question,
    ...(typeof requestId === 'string' && requestId.trim()
      ? { requestId: requestId.trim() }
      : {}),
    ...(typeof anchorQuote === 'string' && anchorQuote.trim()
      ? { anchorQuote: anchorQuote.trim() }
      : {}),
    ...(used === true ? { used: true } : {}),
  };
};

/**
 * 解析数据库或 IPC 传入的引导结果。
 * 坏数据返回 undefined，让页面退回到普通开场问题，而不是白屏。
 */
export const parseGuidanceView = (value: unknown): GuidanceView | undefined => {
  let parsed: unknown = value;

  if (typeof value === 'string') {
    if (!value.trim()) {
      return undefined;
    }

    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  if (!isRecord(parsed)) {
    return undefined;
  }

  const { status, reason, suggestions, bodyHash, updatedAt } = parsed;

  if (
    !isGuidanceStatus(status) ||
    !Array.isArray(suggestions) ||
    typeof bodyHash !== 'string' ||
    typeof updatedAt !== 'number' ||
    !Number.isFinite(updatedAt)
  ) {
    return undefined;
  }

  return {
    status,
    ...(typeof reason === 'string' ? { reason } : {}),
    suggestions: suggestions.flatMap((entry) => {
      const suggestion = parseSuggestion(entry);
      return suggestion ? [suggestion] : [];
    }),
    bodyHash,
    updatedAt,
  };
};

export const createPendingGuidance = (): GuidanceView => ({
  status: 'pending',
  suggestions: [],
  bodyHash: '',
  updatedAt: Date.now(),
});
