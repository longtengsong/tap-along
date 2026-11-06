import type { PromptCatalogValues } from '../../shared/prompts.ts';
import { composeTeacherMessages, PROMPT_CATALOG } from '../prompts/index.ts';
import { createModelGateway, type ModelGateway } from './model-gateway.ts';
import {
  getTeacherFailureCode,
  ProviderRequestError,
} from './provider-errors.ts';
import type { DeveloperPromptConfigService } from './developer-prompts.ts';
import type { TeacherRequestInspector } from './teacher-request-inspector.ts';
import type { ProviderConfigService } from './providers.ts';
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
  gateway?: ModelGateway;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export { getTeacherFailureCode, ProviderRequestError };

const streamTeacherReply = async function* (
  input: TeacherGeneratorInput,
  gateway: ModelGateway,
  promptCatalog: PromptCatalogValues,
  inspector: TeacherStreamOptions['inspector'],
  fallback: TeacherGenerator,
  timeoutMs: number,
): AsyncGenerator<string> {
  const messages = composeTeacherMessages(input, promptCatalog);

  try {
    yield* gateway.stream(messages, {
      requestId: input.requestId,
      signal: input.signal,
      timeoutMs,
    });
  } catch (error) {
    if (
      error instanceof ProviderRequestError &&
      error.errorCode === 'PROVIDER_NOT_CONFIGURED'
    ) {
      if (input.requestId) {
        inspector?.recordFallback(input.requestId);
      }

      yield* fallback(input);
      return;
    }

    throw error;
  }
};

export const createModelAwareTeacherStream = ({
  configService,
  fallback,
  promptService,
  inspector,
  gateway,
  fetchImpl,
  timeoutMs = 60_000,
}: TeacherStreamOptions): TeacherGenerator => {
  const modelGateway =
    gateway ??
    createModelGateway({
      configService,
      inspector,
      fetchImpl,
      timeoutMs,
    });

  return async function* (input) {
    yield* streamTeacherReply(
      input,
      modelGateway,
      promptService?.resolve() ?? PROMPT_CATALOG,
      inspector,
      fallback,
      timeoutMs,
    );
  };
};
