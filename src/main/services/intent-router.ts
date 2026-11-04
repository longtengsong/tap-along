import type { PageSnapshot } from '../../shared/pages.ts';
import { buildIntentRouterMessages } from '../prompts/research.ts';
import {
  createStructuredCompletion,
  type StructuredCompletion,
} from './structured-completion.ts';
import type { ProviderConfigService } from './providers.ts';

type FetchLike = typeof fetch;

export interface ResearchRoute {
  mode: 'reflect' | 'research';
  queries: string[];
  reason?: string;
}

export interface IntentRouter {
  route(input: {
    page: PageSnapshot;
    userText: string;
    signal?: AbortSignal;
  }): Promise<ResearchRoute>;
}

interface IntentRouterOptions {
  configService: Pick<ProviderConfigService, 'resolveActive'>;
  completion?: StructuredCompletion;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export class IntentRouterError extends Error {
  constructor(message = '意图路由输出不符合契约') {
    super(message);
    this.name = 'IntentRouterError';
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
    throw new IntentRouterError();
  }

  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    throw new IntentRouterError();
  }
};

const normalizeQueries = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .flatMap((entry) =>
          typeof entry === 'string' && entry.trim()
            ? [entry.trim().slice(0, 120)]
            : [],
        )
        .filter(Boolean),
    ),
  ].slice(0, 3);
};

export const createIntentRouter = ({
  configService,
  completion,
  fetchImpl,
  timeoutMs = 8_000,
}: IntentRouterOptions): IntentRouter => {
  const complete =
    completion ??
    createStructuredCompletion({ configService, fetchImpl, timeoutMs });

  return {
    async route({ page, userText, signal }) {
      const content = await complete.complete(
        buildIntentRouterMessages({ page, userText }),
        { maxTokens: 250, signal },
      );
      const parsed = extractJson(content);

      if (!isRecord(parsed)) {
        throw new IntentRouterError();
      }

      const mode = parsed.mode;

      if (mode !== 'research' && mode !== 'reflect') {
        throw new IntentRouterError();
      }

      if (mode === 'reflect') {
        return { mode, queries: [] };
      }

      const queries = normalizeQueries(parsed.queries);
      const fallbackQuery = userText.trim().slice(0, 120);

      if (queries.length === 0 && fallbackQuery) {
        queries.push(fallbackQuery);
      }

      if (queries.length === 0) {
        return { mode: 'reflect', queries: [] };
      }

      return {
        mode,
        queries,
        ...(typeof parsed.reason === 'string' && parsed.reason.trim()
          ? { reason: parsed.reason.trim().slice(0, 300) }
          : {}),
      };
    },
  };
};
