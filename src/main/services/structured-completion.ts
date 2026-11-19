import type { ChatMessage } from '../prompts/teacher-context.ts';
import { createModelGateway, type ModelGateway } from './model-gateway.ts';
import type { ProviderConfigService } from './providers.ts';
import type { TeacherRequestInspector } from './teacher-request-inspector.ts';

type FetchLike = typeof fetch;

interface StructuredCompletionOptions {
  configService: Pick<ProviderConfigService, 'resolveActive'>;
  inspector?: Pick<
    TeacherRequestInspector,
    'recordSent' | 'recordFailed' | 'recordCompleted'
  >;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

interface CompleteOptions {
  requestId?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface StructuredCompletion {
  complete(messages: ChatMessage[], options?: CompleteOptions): Promise<string>;
}

/** 非流式补全的兼容入口；真正的传输统一走 ModelGateway。 */
export const createStructuredCompletion = ({
  configService,
  inspector,
  fetchImpl,
  timeoutMs = 8_000,
}: StructuredCompletionOptions): StructuredCompletion => {
  const gateway: ModelGateway = createModelGateway({
    configService,
    inspector,
    fetchImpl,
    timeoutMs,
  });

  return {
    complete(messages, options = {}) {
      return gateway.complete(messages, {
        requestId: options.requestId,
        maxTokens: options.maxTokens ?? 300,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
      });
    },
  };
};
