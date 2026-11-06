import type { PageSnapshot } from '../../shared/pages.ts';
import { buildGuidanceMessages } from '../prompts/guidance.ts';
import {
  createStructuredCompletion,
  type StructuredCompletion,
} from './structured-completion.ts';
import type { ProviderConfigService } from './providers.ts';
import type { RelatedNoteCandidate } from './related-notes.ts';
import type { TeacherRequestInspector } from './teacher-request-inspector.ts';

type FetchLike = typeof fetch;

export interface GuidancePlanInput {
  page: PageSnapshot;
  candidates: RelatedNoteCandidate[];
  /** 模型请求的 requestId；由 GuidanceService 生成，用于开发者模式查看请求。 */
  requestId?: string;
}

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

export interface GuidancePlanner {
  plan(input: GuidancePlanInput): Promise<GuidanceDecision>;
}

export class GuidanceOutputError extends Error {
  constructor(message = '引导判定输出不符合契约') {
    super(message);
    this.name = 'GuidanceOutputError';
  }
}

interface GuidancePlannerOptions {
  configService: Pick<ProviderConfigService, 'resolveActive'>;
  completion?: StructuredCompletion;
  inspector?: Pick<TeacherRequestInspector, 'recordSent' | 'recordFailed'>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
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

const parseDecision = (
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

export const createGuidancePlanner = ({
  configService,
  completion,
  inspector,
  fetchImpl,
  timeoutMs = 8_000,
}: GuidancePlannerOptions): GuidancePlanner => {
  const complete =
    completion ??
    createStructuredCompletion({
      configService,
      inspector,
      fetchImpl,
      timeoutMs,
    });

  return {
    async plan({ page, candidates, requestId }) {
      const baseMessages = buildGuidanceMessages({ page, candidates });

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const messages =
          attempt === 0
            ? baseMessages
            : [
                ...baseMessages,
                {
                  role: 'user' as const,
                  content:
                    'Your previous output was invalid. Return only a JSON object that matches the requested shape.',
                },
              ];
        const content = await complete.complete(messages, {
          maxTokens: 600,
          requestId,
          timeoutMs,
        });

        try {
          return parseDecision(content, candidates);
        } catch (error) {
          if (!(error instanceof GuidanceOutputError) || attempt > 0) {
            throw error;
          }
        }
      }

      throw new GuidanceOutputError();
    },
  };
};
