import type { AppErrorCode } from '../../shared/errors.ts';
import type { PageMessageSnapshot, PageSnapshot } from '../../shared/pages.ts';
import { PROMPT_CATALOG } from '../prompts/index.ts';
import { buildChatCompletionsUrl } from './provider-connection.ts';
import type {
  ProviderConfigService,
  ProviderRuntimeConfig,
} from './providers.ts';
import type { TeacherGenerator, TeacherGeneratorInput } from './teacher.ts';

type FetchLike = typeof fetch;
type ChatRole = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface TeacherStreamOptions {
  configService: Pick<ProviderConfigService, 'resolveActive'>;
  fallback: TeacherGenerator;
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

const renderPromptTemplate = (
  template: string,
  values: Record<string, string>,
) =>
  template.replace(/\{\{([^}]+)\}\}/g, (placeholder, key: string) => {
    return values[key] ?? placeholder;
  });

const buildPageContext = (page: PageSnapshot) =>
  renderPromptTemplate(PROMPT_CATALOG.teacher.context.currentPage, {
    title: page.title,
    body: page.body,
  });

const buildResumePageContext = (
  page: PageSnapshot,
  kind: 'closedPage' | 'targetPage',
) =>
  renderPromptTemplate(PROMPT_CATALOG.teacher.context[kind], {
    title: page.title,
    body: page.body,
  });

const toChatMessage = (message: PageMessageSnapshot): ChatMessage | null => {
  if (!message.text.trim()) {
    return null;
  }

  return {
    role: message.role === 'teacher' ? 'assistant' : 'user',
    content: message.text,
  };
};

const toPageMessages = (page: PageSnapshot) =>
  page.messages
    .map(toChatMessage)
    .filter((message): message is ChatMessage => message !== null);

export const buildTeacherMessages = ({
  page,
  userText,
}: TeacherGeneratorInput): ChatMessage[] => {
  const messages: ChatMessage[] = [
    { role: 'system', content: PROMPT_CATALOG.teacher.system },
    { role: 'system', content: buildPageContext(page) },
    ...toPageMessages(page),
  ];
  const latest = messages.at(-1);

  if (latest?.role !== 'user' || latest.content !== userText) {
    messages.push({ role: 'user', content: userText });
  }

  return messages;
};

export const buildResumeTeacherMessages = ({
  page,
  contextPage,
  userText,
}: TeacherGeneratorInput & { contextPage: PageSnapshot }): ChatMessage[] => {
  const contextMessages = toPageMessages(contextPage);
  const targetMessages = toPageMessages(page);
  const messages: ChatMessage[] = [
    { role: 'system', content: PROMPT_CATALOG.teacher.system },
    { role: 'system', content: PROMPT_CATALOG.teacher.resume },
    {
      role: 'system',
      content: buildResumePageContext(contextPage, 'closedPage'),
    },
    ...contextMessages,
    {
      role: 'system',
      content: buildResumePageContext(page, 'targetPage'),
    },
    ...targetMessages,
  ];

  if (
    !contextMessages.some((message) => message.role === 'user') &&
    !targetMessages.some((message) => message.role === 'user')
  ) {
    messages.push({ role: 'user', content: userText });
  }

  return messages;
};

export const buildMaintenanceTeacherMessages = ({
  page,
  userText,
  maintenanceKind,
}: TeacherGeneratorInput & {
  maintenanceKind: 'edit' | 'append';
}): ChatMessage[] => {
  const action = PROMPT_CATALOG.teacher.maintenanceAction[maintenanceKind];

  return [
    { role: 'system', content: PROMPT_CATALOG.teacher.system },
    { role: 'system', content: PROMPT_CATALOG.teacher.maintenance },
    { role: 'system', content: action },
    { role: 'system', content: buildPageContext(page) },
    ...toPageMessages(page),
    { role: 'user', content: userText },
  ];
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
): AsyncGenerator<string> {
  const controller = new AbortController();
  const cancelFromCaller = () => controller.abort();

  if (input.signal?.aborted) {
    controller.abort();
  } else {
    input.signal?.addEventListener('abort', cancelFromCaller, { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const messages = input.maintenanceKind
    ? buildMaintenanceTeacherMessages({
        ...input,
        maintenanceKind: input.maintenanceKind,
      })
    : input.contextPage
      ? buildResumeTeacherMessages({
          ...input,
          contextPage: input.contextPage,
        })
      : buildTeacherMessages(input);

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
        throw new ProviderRequestError('PROVIDER_TIMEOUT');
      }

      throw new ProviderRequestError('PROVIDER_NETWORK_ERROR');
    }

    if (!response.ok) {
      throw new ProviderRequestError(
        providerErrorCodeForStatus(response.status),
      );
    }

    if (!response.body) {
      throw new ProviderRequestError('PROVIDER_REQUEST_FAILED');
    }

    try {
      yield* readChatCompletionStream(response.body);
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderRequestError('PROVIDER_TIMEOUT');
      }

      throw new ProviderRequestError('PROVIDER_NETWORK_ERROR');
    }
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener('abort', cancelFromCaller);
  }
};

export const createModelAwareTeacherStream = ({
  configService,
  fallback,
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
}: TeacherStreamOptions): TeacherGenerator =>
  async function* (input) {
    const resolved = await configService.resolveActive();

    if (!resolved.ok) {
      if (resolved.errorCode === 'PROVIDER_NOT_CONFIGURED') {
        yield* fallback(input);
        return;
      }

      throw new ProviderRequestError(resolved.errorCode);
    }

    yield* streamProviderReply(input, resolved.config, fetchImpl, timeoutMs);
  };
