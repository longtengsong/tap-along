import type { RelatedNoteCandidate } from '../related-notes.ts';

export interface GuidanceDecisionSuggestion {
  relatedPageIds: number[];
  why: string;
  question: string;
}

export interface GuidanceDecision {
  needDeeperUnderstanding: boolean;
  reason?: string;
  suggestions: GuidanceDecisionSuggestion[];
}

export class GuidanceOutputError extends Error {
  constructor(message = '引导判定输出不符合契约') {
    super(message);
    this.name = 'GuidanceOutputError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractJson = (content: string): unknown => {
  const withoutFence = content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');

  if (start < 0 || end <= start) {
    throw new GuidanceOutputError();
  }

  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    throw new GuidanceOutputError();
  }
};

const parseRelatedPageIds = (
  entry: Record<string, unknown>,
  candidateIds: Set<number>,
): number[] | null => {
  const raw = Array.isArray(entry.relatedPageIds)
    ? entry.relatedPageIds
    : typeof entry.relatedPageId === 'number'
      ? [entry.relatedPageId]
      : null;

  if (!raw || raw.length === 0 || raw.length > 4) {
    return null;
  }

  const ids: number[] = [];

  for (const id of raw) {
    if (
      typeof id !== 'number' ||
      !Number.isInteger(id) ||
      !candidateIds.has(id) ||
      ids.includes(id)
    ) {
      return null;
    }

    ids.push(id);
  }

  return ids;
};

/**
 * 把 guidance planner 的原始文本解析成领域对象。
 * 这里只做输出契约校验，不负责请求、prompt 或重试。
 */
export const parseGuidanceOutput = (
  content: string,
  candidates: RelatedNoteCandidate[],
): GuidanceDecision => {
  const parsed = extractJson(content);

  if (
    !isRecord(parsed) ||
    typeof parsed.needDeeperUnderstanding !== 'boolean'
  ) {
    throw new GuidanceOutputError();
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.pageId));
  const rawSuggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
    : [];
  const suggestions: GuidanceDecisionSuggestion[] = [];

  for (const entry of rawSuggestions) {
    if (suggestions.length >= 1 || !isRecord(entry)) {
      continue;
    }

    const { why, question } = entry;
    const relatedPageIds = parseRelatedPageIds(entry, candidateIds);

    if (
      !relatedPageIds ||
      typeof why !== 'string' ||
      typeof question !== 'string'
    ) {
      continue;
    }

    const normalizedWhy = why.trim();
    const normalizedQuestion = question.trim();

    if (
      !normalizedWhy ||
      normalizedWhy.length > 120 ||
      !normalizedQuestion ||
      normalizedQuestion.length > 160 ||
      /[\r\n]/.test(normalizedQuestion) ||
      !/[?？]$/.test(normalizedQuestion)
    ) {
      continue;
    }

    suggestions.push({
      relatedPageIds,
      why: normalizedWhy,
      question: normalizedQuestion,
    });
  }

  if (
    parsed.needDeeperUnderstanding &&
    candidates.length > 0 &&
    suggestions.length === 0
  ) {
    throw new GuidanceOutputError();
  }

  const reason =
    typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 300)
      : undefined;

  return {
    needDeeperUnderstanding: parsed.needDeeperUnderstanding,
    ...(reason ? { reason } : {}),
    suggestions: parsed.needDeeperUnderstanding ? suggestions : [],
  };
};
