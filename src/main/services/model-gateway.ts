import type { ChatMessage } from '../prompts/teacher-context.ts';
import { buildChatCompletionsUrl } from './provider-connection.ts';
import {
  ProviderRequestError,
  providerErrorCodeForStatus,
} from './provider-errors.ts';
import type {
  ProviderConfigService,
  ProviderRuntimeConfig,
} from './providers.ts';
import type { TeacherRequestInspector } from './teacher-request-inspector.ts';

type FetchLike = typeof fetch;

type RequestInspector = Pick<
  TeacherRequestInspector,
  'recordSent' | 'recordFailed'
>;

export interface ModelGatewayOptions {
  configService: Pick<ProviderConfigService, 'resolveActive'>;
  inspector?: RequestInspector;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export interface ModelRequestOptions {
  requestId?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ModelGateway {
  complete(
    messages: ChatMessage[],
    options?: ModelRequestOptions,
  ): Promise<string>;
  stream(
    messages: ChatMessage[],
    options?: ModelRequestOptions,
  ): AsyncGenerator<string>;
  probe(
    config: ProviderRuntimeConfig,
    messages: ChatMessage[],
    timeoutMs?: number,
  ): Promise<void>;
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
  error?: unknown;
}

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

const parseSseBlock = (block: string): { done: boolean; content?: string } => {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')
    .trim();

  if (!data) {
    return { done: false };
  }

  if (data === '[DONE]') {
    return { done: true };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(data);
  } catch {
    throw new ProviderRequestError('PROVIDER_REQUEST_FAILED');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ProviderRequestError('PROVIDER_REQUEST_FAILED');
  }

  const chunk = payload as ChatCompletionChunk;

  if (chunk.error) {
    throw new ProviderRequestError('PROVIDER_REQUEST_FAILED');
  }

  const content = chunk.choices?.[0]?.delta?.content;
  return typeof content === 'string' && content
    ? { done: false, content }
    : { done: false };
};

const readChatCompletionStream = async function* (
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundary = buffer.match(/\r?\n\r?\n/);

        if (!boundary || boundary.index === undefined) {
          break;
        }

        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const parsed = parseSseBlock(block);

        if (parsed.content) {
          yield parsed.content;
        }

        if (parsed.done) {
          return;
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const parsed = parseSseBlock(buffer);

      if (parsed.content) {
        yield parsed.content;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
};

export const createModelGateway = ({
  configService,
  inspector,
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
}: ModelGatewayOptions): ModelGateway => {
  const recordSent = (
    requestId: string | undefined,
    providerId: string,
    model: string,
    messages: ChatMessage[],
  ) => {
    if (requestId) {
      inspector?.recordSent({
        requestId,
        providerId,
        model,
        messages,
      });
    }
  };

  const recordFailed = (requestId: string | undefined, errorCode: string) => {
    if (requestId) {
      inspector?.recordFailed(
        requestId,
        errorCode as Parameters<RequestInspector['recordFailed']>[1],
      );
    }
  };

  return {
    async complete(messages, options = {}) {
      const resolved = await configService.resolveActive();

      if (!resolved.ok) {
        throw new ProviderRequestError(resolved.errorCode);
      }

      const controller = new AbortController();
      const callerSignal = options.signal;
      const abortFromCaller = () => controller.abort();

      if (callerSignal?.aborted) {
        controller.abort();
      } else {
        callerSignal?.addEventListener('abort', abortFromCaller, {
          once: true,
        });
      }

      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? timeoutMs,
      );
      const requestId = options.requestId;
      const fail = (
        errorCode: Parameters<RequestInspector['recordFailed']>[1],
      ) => {
        recordFailed(requestId, errorCode);
        return new ProviderRequestError(errorCode);
      };

      if (!callerSignal?.aborted) {
        recordSent(
          requestId,
          resolved.config.id,
          resolved.config.model,
          messages,
        );
      }

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
                temperature: options.temperature ?? 0,
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
            throw fail('PROVIDER_TIMEOUT');
          }

          throw fail('PROVIDER_NETWORK_ERROR');
        }

        if (!response.ok) {
          throw fail(providerErrorCodeForStatus(response.status));
        }

        let payload: unknown;

        try {
          payload = await response.json();
        } catch {
          throw fail('PROVIDER_REQUEST_FAILED');
        }

        try {
          return readContent(payload);
        } catch (error) {
          if (error instanceof ProviderRequestError) {
            throw fail(error.errorCode);
          }
          throw error;
        }
      } finally {
        clearTimeout(timeout);
        callerSignal?.removeEventListener('abort', abortFromCaller);
      }
    },

    async *stream(messages, options = {}) {
      const resolved = await configService.resolveActive();

      if (!resolved.ok) {
        throw new ProviderRequestError(resolved.errorCode);
      }

      const controller = new AbortController();
      const callerSignal = options.signal;
      const abortFromCaller = () => controller.abort();

      if (callerSignal?.aborted) {
        controller.abort();
      } else {
        callerSignal?.addEventListener('abort', abortFromCaller, {
          once: true,
        });
      }

      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? timeoutMs,
      );
      const requestId = options.requestId;
      const fail = (
        errorCode: Parameters<RequestInspector['recordFailed']>[1],
      ) => {
        recordFailed(requestId, errorCode);
        return new ProviderRequestError(errorCode);
      };

      recordSent(
        requestId,
        resolved.config.id,
        resolved.config.model,
        messages,
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
                stream: true,
              }),
              signal: controller.signal,
            },
          );
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw fail('PROVIDER_TIMEOUT');
          }

          throw fail('PROVIDER_NETWORK_ERROR');
        }

        if (!response.ok) {
          throw fail(providerErrorCodeForStatus(response.status));
        }

        if (!response.body) {
          throw fail('PROVIDER_REQUEST_FAILED');
        }

        try {
          yield* readChatCompletionStream(response.body);
        } catch (error) {
          if (error instanceof ProviderRequestError) {
            throw fail(error.errorCode);
          }

          if (error instanceof Error && error.name === 'AbortError') {
            throw fail('PROVIDER_TIMEOUT');
          }

          throw fail('PROVIDER_NETWORK_ERROR');
        }
      } finally {
        clearTimeout(timeout);
        callerSignal?.removeEventListener('abort', abortFromCaller);
      }
    },

    async probe(config, messages, probeTimeout = timeoutMs) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), probeTimeout);

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
              max_tokens: 1,
              stream: false,
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
            providerErrorCodeForStatus(response.status),
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};
