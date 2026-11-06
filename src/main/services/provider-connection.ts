import type { ProviderConnectionResult } from '../../shared/providers.ts';
import type { PromptCatalogValues } from '../../shared/prompts.ts';
import { PROMPT_CATALOG } from '../prompts/index.ts';
import type { DeveloperPromptConfigService } from './developer-prompts.ts';
import type { ModelGateway } from './model-gateway.ts';
import { ProviderRequestError } from './provider-errors.ts';
import type { ProviderConfigService } from './providers.ts';

export const buildChatCompletionsUrl = (baseUrl: string) => {
  const normalized = baseUrl.replace(/\/+$/, '');

  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`;
};

const errorCodeFor = (error: unknown) => {
  if (error instanceof ProviderRequestError) {
    return error.errorCode === 'PROVIDER_REQUEST_FAILED'
      ? 'PROVIDER_TEST_FAILED'
      : error.errorCode;
  }

  return 'PROVIDER_TEST_FAILED';
};

export class ProviderConnectionTester {
  private readonly gateway: Pick<ModelGateway, 'probe'>;
  private readonly timeoutMs: number;

  constructor(gateway: Pick<ModelGateway, 'probe'>, timeoutMs = 15_000) {
    this.gateway = gateway;
    this.timeoutMs = timeoutMs;
  }

  async test(
    config: Parameters<ModelGateway['probe']>[0],
    promptCatalog: PromptCatalogValues = PROMPT_CATALOG,
  ): Promise<ProviderConnectionResult> {
    try {
      await this.gateway.probe(
        config,
        [
          {
            role: 'user',
            content: promptCatalog.provider.connectionTest,
          },
        ],
        this.timeoutMs,
      );

      return { ok: true };
    } catch (error) {
      return { ok: false, errorCode: errorCodeFor(error) };
    }
  }
}

export class ProviderConnectionService {
  private readonly configService: Pick<ProviderConfigService, 'resolve'>;
  private readonly tester: Pick<ProviderConnectionTester, 'test'>;
  private readonly promptService?: Pick<
    DeveloperPromptConfigService,
    'resolve'
  >;

  constructor(
    configService: Pick<ProviderConfigService, 'resolve'>,
    tester: Pick<ProviderConnectionTester, 'test'>,
    promptService?: Pick<DeveloperPromptConfigService, 'resolve'>,
  ) {
    this.configService = configService;
    this.tester = tester;
    this.promptService = promptService;
  }

  async test(id: unknown): Promise<ProviderConnectionResult> {
    const resolved = await this.configService.resolve(id);

    if (!resolved.ok) {
      return { ok: false, errorCode: resolved.errorCode };
    }

    return this.tester.test(
      resolved.config,
      this.promptService?.resolve() ?? PROMPT_CATALOG,
    );
  }
}
