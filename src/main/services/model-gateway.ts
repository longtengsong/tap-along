import type { ChatMessage } from '../prompts/teacher-context.ts';
import type { ImageCapabilityResolver } from './image-capability.ts';
import type { ChatImageData, ImageContextResolver } from './image-context.ts';
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
  'recordSent' | 'recordFailed' | 'recordCompleted'
>;

export interface ModelGatewayOptions {
  configService: Pick<ProviderConfigService, 'resolveActive'>;
  inspector?: RequestInspector;
  images?: ImageContextResolver;
  capabilities?: ImageCapabilityResolver;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

type ProviderContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface ProviderMessage {
  role: ChatMessage['role'];
  content: string | ProviderContentPart[];
}

export interface ModelRequestOptions {
  requestId?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** 本次请求实际生效的 Prompt 版本，仅用于开发者记录。 */
  promptVersion?: string;
  /** 当前生效 Prompt 目录的内容指纹，仅用于开发者记录。 */
  promptHash?: string;
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

const toInspectionMessages = (messages: ChatMessage[]) =>
  messages.map((message) => ({
    role: message.role,
    content:
      message.imageIds && message.imageIds.length > 0
        ? `${message.content}\n[${message.imageIds.length} image(s)]`
        : message.content,
  }));

const buildProviderMessages = async (
  messages: ChatMessage[],
  images: ImageContextResolver | undefined,
  capabilities: ImageCapabilityResolver | undefined,
): Promise<ProviderMessage[]> => {
  const hasImages = messages.some(
    (message) =>
      message.role === 'user' &&
      message.imageIds !== undefined &&
      message.imageIds.length > 0,
  );
  let supportsImages = false;

  if (hasImages && capabilities) {
    try {
      supportsImages = await capabilities.supportsActive();
    } catch {
      supportsImages = false;
    }
  }

  const imageCache = new Map<string, Promise<ChatImageData | null>>();
  const attachedImageIds = new Set<string>();
  const resolveImage = (imageId: string) => {
    let pending = imageCache.get(imageId);

    if (!pending) {
      pending = images?.resolve(imageId) ?? Promise.resolve(null);
      imageCache.set(imageId, pending);
    }

    return pending;
  };

  const result: ProviderMessage[] = [];

  for (const message of messages) {
    if (message.imageContext && !supportsImages) {
      continue;
    }

    if (
      message.role !== 'user' ||
      !message.imageIds ||
      message.imageIds.length === 0
    ) {
      result.push({ role: message.role, content: message.content });
      continue;
    }

    if (!supportsImages) {
      result.push({ role: message.role, content: message.content });
      continue;
    }

    const parts: ProviderContentPart[] = [
      { type: 'text', text: message.content },
    ];

    for (const imageId of new Set(message.imageIds)) {
      if (attachedImageIds.has(imageId)) {
        continue;
      }

      const image = await resolveImage(imageId).catch(() => null);

      if (!image) {
        parts.push({ type: 'text', text: '[image unavailable]' });
        continue;
      }

      attachedImageIds.add(imageId);
      parts.push({
        type: 'image_url',
        image_url: { url: image.dataUrl },
      });
    }

    result.push({ role: message.role, content: parts });
  }

  return result;
};

export const createModelGateway = ({
  configService,
  inspector,
  images,
  capabilities,
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
}: ModelGatewayOptions): ModelGateway => {
  const recordSent = (
    requestId: string | undefined,
    providerId: string,
    model: string,
    messages: ChatMessage[],
    meta: Pick<
      ModelRequestOptions,
      'promptVersion' | 'promptHash' | 'temperature'
    > = {},
  ) => {
    if (requestId) {
      inspector?.recordSent({
        requestId,
        providerId,
        model,
        messages,
        ...(meta.promptVersion ? { promptVersion: meta.promptVersion } : {}),
        ...(meta.promptHash ? { promptHash: meta.promptHash } : {}),
        ...(meta.temperature !== undefined
          ? { temperature: meta.temperature }
          : {}),
      });
    }
  };

  const recordFailed = (
    requestId: string | undefined,
    errorCode: string,
    latencyMs?: number,
  ) => {
    if (requestId) {
      inspector?.recordFailed?.(
        requestId,
        errorCode as Parameters<RequestInspector['recordFailed']>[1],
        latencyMs,
      );
    }
  };

  const recordCompleted = (
    requestId: string | undefined,
    reply: string,
    latencyMs: number,
  ) => {
    if (requestId && reply.trim()) {
      inspector?.recordCompleted?.(requestId, { reply, latencyMs });
    }
  };

  return {
    async complete(messages, options = {}) {
      const resolved = await configService.resolveActive();

      if (!resolved.ok) {
        throw new ProviderRequestError(resolved.errorCode);
      }

      const startedAt = Date.now();
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
        recordFailed(requestId, errorCode, Date.now() - startedAt);
        return new ProviderRequestError(errorCode);
      };

      const providerMessages = await buildProviderMessages(
        messages,
        images,
        capabilities,
      );

      if (!callerSignal?.aborted) {
        recordSent(
          requestId,
          resolved.config.id,
          resolved.config.model,
          toInspectionMessages(messages),
          {
            promptVersion: options.promptVersion,
            promptHash: options.promptHash,
            temperature: options.temperature ?? 0,
          },
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
                messages: providerMessages,
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

        let content: string;

        try {
          content = readContent(payload);
        } catch (error) {
          if (error instanceof ProviderRequestError) {
            throw fail(error.errorCode);
          }
          throw error;
        }

        recordCompleted(requestId, content, Date.now() - startedAt);
        return content;
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

      const startedAt = Date.now();
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
        recordFailed(requestId, errorCode, Date.now() - startedAt);
        return new ProviderRequestError(errorCode);
      };

      const providerMessages = await buildProviderMessages(
        messages,
        images,
        capabilities,
      );

      recordSent(
        requestId,
        resolved.config.id,
        resolved.config.model,
        toInspectionMessages(messages),
        {
          promptVersion: options.promptVersion,
          promptHash: options.promptHash,
        },
      );

      let reply = '';
      let completed = false;

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
                messages: providerMessages,
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
          for await (const chunk of readChatCompletionStream(response.body)) {
            reply += chunk;
            yield chunk;
          }
          completed = true;
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

        if (completed) {
          recordCompleted(requestId, reply, Date.now() - startedAt);
        }
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
