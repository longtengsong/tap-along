import type { AppErrorCode } from './errors.ts';

export const GUIDANCE_STATUSES = [
  'pending',
  'needed',
  'not_needed',
  'no_candidates',
  'failed',
] as const;

export type GuidanceStatus = (typeof GUIDANCE_STATUSES)[number];

export interface GuidanceSuggestion {
  id: string;
  relatedPageId: number;
  title: string;
  source: string;
  why: string;
  question: string;
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
  mode: 'refresh' | 'retry';
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

const parseSuggestion = (value: unknown): GuidanceSuggestion | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { id, relatedPageId, title, source, why, question, anchorQuote, used } =
    value;

  if (
    typeof id !== 'string' ||
    !id.trim() ||
    typeof relatedPageId !== 'number' ||
    !Number.isInteger(relatedPageId) ||
    relatedPageId <= 0 ||
    typeof title !== 'string' ||
    typeof source !== 'string' ||
    typeof why !== 'string' ||
    typeof question !== 'string'
  ) {
    return null;
  }

  return {
    id,
    relatedPageId,
    title,
    source,
    why,
    question,
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
