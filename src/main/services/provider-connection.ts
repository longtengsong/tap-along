import type { ProviderConnectionResult } from '../../shared/providers.ts';
import type {
  ProviderConfigService,
  ProviderRuntimeConfig,
} from './providers.ts';

type FetchLike = typeof fetch;

export const buildChatCompletionsUrl = (baseUrl: string) => {
  const normalized = baseUrl.replace(/\/+$/, '');

  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`;
};

export class ProviderConnectionTester {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(fetchImpl: FetchLike = globalThis.fetch, timeoutMs = 15_000) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async test(config: ProviderRuntimeConfig): Promise<ProviderConnectionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(
        buildChatCompletionsUrl(config.baseUrl),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: 'Reply with OK.' }],
            max_tokens: 1,
            stream: false,
          }),
          signal: controller.signal,
        },
      );

      if (response.ok) {
        return { ok: true };
      }

      if (response.status === 401 || response.status === 403) {
        return { ok: false, errorCode: 'PROVIDER_UNAUTHORIZED' };
      }

      if (response.status === 400 || response.status === 404) {
        return { ok: false, errorCode: 'MODEL_UNAVAILABLE' };
      }

      if (response.status === 429) {
        return { ok: false, errorCode: 'PROVIDER_RATE_LIMITED' };
      }

      return { ok: false, errorCode: 'PROVIDER_TEST_FAILED' };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false, errorCode: 'PROVIDER_TIMEOUT' };
      }

      return { ok: false, errorCode: 'PROVIDER_NETWORK_ERROR' };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class ProviderConnectionService {
  private readonly configService: Pick<ProviderConfigService, 'resolve'>;
  private readonly tester: Pick<ProviderConnectionTester, 'test'>;

  constructor(
    configService: Pick<ProviderConfigService, 'resolve'>,
    tester: Pick<ProviderConnectionTester, 'test'>,
  ) {
    this.configService = configService;
    this.tester = tester;
  }

  async test(id: unknown): Promise<ProviderConnectionResult> {
    const resolved = await this.configService.resolve(id);

    if (!resolved.ok) {
      return { ok: false, errorCode: resolved.errorCode };
    }

    return this.tester.test(resolved.config);
  }
}
