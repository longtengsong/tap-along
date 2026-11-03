import type { AppErrorCode } from '../../shared/errors.ts';
import type { PromptCatalogValues } from '../../shared/prompts.ts';
import { composeTeacherMessages, PROMPT_CATALOG } from '../prompts/index.ts';
import { buildChatCompletionsUrl } from './provider-connection.ts';
import type { DeveloperPromptConfigService } from './developer-prompts.ts';
import type { TeacherRequestInspector } from './teacher-request-inspector.ts';
import type {
  ProviderConfigService,
  ProviderRuntimeConfig,
} from './providers.ts';
import type { TeacherGenerator, TeacherGeneratorInput } from './teacher.ts';

type FetchLike = typeof fetch;

interface TeacherStreamOptions {
  configService: Pick<ProviderConfigService, 'resolveActive'>;
  fallback: TeacherGenerator;
  promptService?: Pick<DeveloperPromptConfigService, 'resolve'>;
  inspector?: Pick<
    TeacherRequestInspector,
    'recordSent' | 'recordFailed' | 'recordFallback'
  >;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
  error?: unknown;
}

export class ProviderRequestError extends Error {
  readonly errorCode: AppErrorCode;

  constructor(errorCode: AppErrorCode) {
    super('模型服务请求失败');
    this.name = 'ProviderRequestError';
    this.errorCode = errorCode;
  }
}

export const getTeacherFailureCode = (error: unknown): AppErrorCode =>
  error instanceof ProviderRequestError
    ? error.errorCode
    : 'TEACHER_NO_RESPONSE';

const providerErrorCodeForStatus = (status: number): AppErrorCode => {
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

const streamProviderReply = async function* (
  input: TeacherGeneratorInput,
  config: ProviderRuntimeConfig,
  fetchImpl: FetchLike,
  timeoutMs: number,
  promptCatalog: PromptCatalogValues,
  inspector?: Pick<
    TeacherRequestInspector,
    'recordSent' | 'recordFailed' | 'recordFallback'
  >,
): AsyncGenerator<string> {
  const controller = new AbortController();
  const cancelFromCaller = () => controller.abort();

  if (input.signal?.aborted) {
    controller.abort();
  } else {
    input.signal?.addEventListener('abort', cancelFromCaller, { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const messages = composeTeacherMessages(input, promptCatalog);
  const fail = (errorCode: AppErrorCode) => {
    if (input.requestId) {
      inspector?.recordFailed(input.requestId, errorCode);
    }

    return new ProviderRequestError(errorCode);
  };

  if (input.requestId) {
    inspector?.recordSent({
      requestId: input.requestId,
      providerId: config.id,
      model: config.model,
      messages,
    });
  }

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
          stream: true,
        }),
        signal: controller.signal,
      });
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
        if (input.requestId) {
          inspector?.recordFailed(input.requestId, error.errorCode);
        }
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw fail('PROVIDER_TIMEOUT');
      }

      throw fail('PROVIDER_NETWORK_ERROR');
    }
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener('abort', cancelFromCaller);
  }
};

export const createModelAwareTeacherStream = ({
  configService,
  fallback,
  promptService,
  inspector,
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
}: TeacherStreamOptions): TeacherGenerator =>
  async function* (input) {
    const resolved = await configService.resolveActive();

    if (!resolved.ok) {
      if (resolved.errorCode === 'PROVIDER_NOT_CONFIGURED') {
        if (input.requestId) {
          inspector?.recordFallback(input.requestId);
        }
        yield* fallback(input);
        return;
      }

      throw new ProviderRequestError(resolved.errorCode);
    }

    yield* streamProviderReply(
      input,
      resolved.config,
      fetchImpl,
      timeoutMs,
      promptService?.resolve() ?? PROMPT_CATALOG,
      inspector,
    );
  };
