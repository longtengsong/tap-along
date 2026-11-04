import type { PageSnapshot } from '../../shared/pages.ts';
import type { ChatMessage } from '../prompts/teacher-context.ts';
import { buildGuidanceMessages } from '../prompts/guidance.ts';
import { buildChatCompletionsUrl } from './provider-connection.ts';
import { ProviderRequestError } from './model-teacher.ts';
import type {
  ProviderConfigService,
  ProviderRuntimeConfig,
} from './providers.ts';
import type { RelatedNoteCandidate } from './related-notes.ts';

type FetchLike = typeof fetch;

export interface GuidancePlanInput {
  page: PageSnapshot;
  candidates: RelatedNoteCandidate[];
}

export interface GuidanceDecisionSuggestion {
  relatedPageId: number;
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
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

const PROVIDER_ERROR_FOR_STATUS = (status: number) => {
  if (status === 401 || status === 403) {
    return 'PROVIDER_UNAUTHORIZED';
  }

  if (status === 400 || status === 404) {
    return 'MODEL_UNAVAILABLE';
  }

  if (status === 408) {
    return 'PROVIDER_TIMEOUT';
  }

  if (status === 429) {
    return 'PROVIDER_RATE_LIMITED';
  }

  return 'PROVIDER_REQUEST_FAILED';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readContent = (payload: unknown): string => {
  if (!isRecord(payload)) {
    throw new ProviderRequestError('PROVIDER_REQUEST_FAILED');
  }

  const choices = payload.choices;

  if (!Array.isArray(choices)) {
    throw new GuidanceOutputError();
  }

  const content = choices[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new GuidanceOutputError();
  }

  return content.trim();
};

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
  const seen = new Set<number>();
  const suggestions: GuidanceDecisionSuggestion[] = [];

  for (const entry of rawSuggestions) {
    if (suggestions.length >= 2 || !isRecord(entry)) {
      continue;
    }

    const { relatedPageId, why, question } = entry;

    if (
      typeof relatedPageId !== 'number' ||
      !Number.isInteger(relatedPageId) ||
      !candidateIds.has(relatedPageId) ||
      seen.has(relatedPageId) ||
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
      normalizedQuestion.length > 120 ||
      /[\r\n]/.test(normalizedQuestion) ||
      !/[?？]$/.test(normalizedQuestion)
    ) {
      continue;
    }

    seen.add(relatedPageId);
    suggestions.push({
      relatedPageId,
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

const requestCompletion = async (
  messages: ChatMessage[],
  config: ProviderRuntimeConfig,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Awaited<ReturnType<FetchLike>>;

    try {
      response = await fetchImpl(buildChatCompletionsUrl(config.baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
          temperature: 0,
          max_tokens: 600,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderRequestError('PROVIDER_TIMEOUT');
      }

      throw new ProviderRequestError('PROVIDER_NETWORK_ERROR');
    }

    if (!response.ok) {
      throw new ProviderRequestError(
        PROVIDER_ERROR_FOR_STATUS(response.status),
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new ProviderRequestError('PROVIDER_REQUEST_FAILED');
    }

    return readContent(payload);
  } finally {
    clearTimeout(timeout);
  }
};

export const createGuidancePlanner = ({
  configService,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
}: GuidancePlannerOptions): GuidancePlanner => ({
  async plan({ page, candidates }) {
    const resolved = await configService.resolveActive();

    if (!resolved.ok) {
      throw new ProviderRequestError(resolved.errorCode);
    }

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
      const content = await requestCompletion(
        messages,
        resolved.config,
        fetchImpl,
        timeoutMs,
      );

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
});
