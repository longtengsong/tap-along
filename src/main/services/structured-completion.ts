import type { AppErrorCode } from '../../shared/errors.ts';
import type { ChatMessage } from '../prompts/teacher-context.ts';
import { buildChatCompletionsUrl } from './provider-connection.ts';
import { ProviderRequestError } from './model-teacher.ts';
import type { ProviderConfigService } from './providers.ts';

type FetchLike = typeof fetch;

interface StructuredCompletionOptions {
  configService: Pick<ProviderConfigService, 'resolveActive'>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

interface CompleteOptions {
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface StructuredCompletion {
  complete(messages: ChatMessage[], options?: CompleteOptions): Promise<string>;
}

const providerErrorForStatus = (status: number): AppErrorCode => {
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

const readContent = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ProviderRequestError('PROVIDER_REQUEST_FAILED');
  }

  const choices = (payload as { choices?: unknown }).choices;

  if (!Array.isArray(choices)) {
    throw new ProviderRequestError('PROVIDER_REQUEST_FAILED');
  }

  const content = choices[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new ProviderRequestError('PROVIDER_REQUEST_FAILED');
  }

  return content.trim();
};

export const createStructuredCompletion = ({
  configService,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
}: StructuredCompletionOptions): StructuredCompletion => ({
  async complete(messages, options = {}) {
    const resolved = await configService.resolveActive();

    if (!resolved.ok) {
      throw new ProviderRequestError(resolved.errorCode);
    }

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    const callerSignal = options.signal;

    if (callerSignal?.aborted) {
      controller.abort();
    } else {
      callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    }

    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? timeoutMs,
    );

    try {
      let response: Awaited<ReturnType<FetchLike>>;

      try {
        response = await fetchImpl(
          buildChatCompletionsUrl(resolved.config.baseUrl),
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resolved.config.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: resolved.config.model,
              messages,
              stream: false,
              temperature: 0,
              max_tokens: options.maxTokens ?? 300,
            }),
            signal: controller.signal,
          },
        );
      } catch (error) {
        if (callerSignal?.aborted) {
          const abortError = new Error('aborted');
          abortError.name = 'AbortError';
          throw abortError;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new ProviderRequestError('PROVIDER_TIMEOUT');
        }

        throw new ProviderRequestError('PROVIDER_NETWORK_ERROR');
      }

      if (!response.ok) {
        throw new ProviderRequestError(providerErrorForStatus(response.status));
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
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  },
});
