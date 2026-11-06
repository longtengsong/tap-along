import type { PageSnapshot } from '../../shared/pages.ts';
import { buildIntentRouterMessages } from '../prompts/research.ts';
import {
  createStructuredCompletion,
  type StructuredCompletion,
} from './structured-completion.ts';
import type { ProviderConfigService } from './providers.ts';
import {
  IntentRouterError,
  parseIntentOutput,
} from './validators/intent-output.ts';

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

export { IntentRouterError };

const finalizeIntentRoute = (
  decision: ReturnType<typeof parseIntentOutput>,
  userText: string,
): ResearchRoute => {
  if (decision.mode === 'reflect') {
    return { mode: 'reflect', queries: [] };
  }

  const queries = [...decision.queries];
  const fallbackQuery = userText.trim().slice(0, 120);

  if (queries.length === 0 && fallbackQuery) {
    queries.push(fallbackQuery);
  }

  if (queries.length === 0) {
    return { mode: 'reflect', queries: [] };
  }

  return {
    mode: 'research',
    queries,
    ...(decision.reason ? { reason: decision.reason } : {}),
  };
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
        { maxTokens: 250, signal, timeoutMs },
      );

      return finalizeIntentRoute(parseIntentOutput(content), userText);
    },
  };
};
