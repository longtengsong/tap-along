import {
  imageCapabilityKey,
  type ImageCapabilityStatus,
  type ProviderImageCapabilityResult,
} from '../../shared/providers.ts';
import { buildChatCompletionsUrl } from './provider-connection.ts';
import type {
  ProviderConfigService,
  ProviderRuntimeConfig,
} from './providers.ts';

export type { ImageCapabilityStatus };

export interface ImageCapabilityResolver {
  supportsActive(): Promise<boolean>;
}

export interface ImageCapabilityCacheStore {
  read():
    | Record<string, { status: ImageCapabilityStatus; checkedAt: number }>
    | null
    | undefined;
  write(
    cache: Record<string, { status: ImageCapabilityStatus; checkedAt: number }>,
  ): void;
}

type FetchLike = typeof fetch;

interface ImageCapabilityOptions {
  fetchImpl?: FetchLike;
  now?: () => number;
  cache?: ImageCapabilityCacheStore;
  cacheTtlMs?: number;
  unknownCacheTtlMs?: number;
  timeoutMs?: number;
}

interface CacheEntry {
  status: ImageCapabilityStatus;
  checkedAt: number;
}

const PROBE_IMAGE_WEBP =
  'UklGRmQAAABXRUJQVlA4IFgAAAAwBACdASpAAEAAPm0qkkWkIqGY/xwAQAbEsYBpdCYUeCCo4KJRr2YkGKAA/urUfvctFIr8szhXpsWJz9m+HRQw8V7rt4/+dvxB+oJoeTNa2mYFcjUAAAAA';

const SUPPORTED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UNKNOWN_TTL_MS = 10 * 60 * 1000;

const isStatus = (value: unknown): value is ImageCapabilityStatus =>
  value === 'supported' || value === 'unsupported' || value === 'unknown';

export class ImageCapabilityService implements ImageCapabilityResolver {
  private readonly configService: Pick<
    ProviderConfigService,
    'resolve' | 'resolveActive'
  >;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly cacheStore?: ImageCapabilityCacheStore;
  private readonly cacheTtlMs: number;
  private readonly unknownCacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<ImageCapabilityStatus>>();

  constructor(
    configService: Pick<ProviderConfigService, 'resolve' | 'resolveActive'>,
    {
      fetchImpl = globalThis.fetch,
      now = Date.now,
      cache,
      cacheTtlMs = SUPPORTED_TTL_MS,
      unknownCacheTtlMs = UNKNOWN_TTL_MS,
      timeoutMs = 8_000,
    }: ImageCapabilityOptions = {},
  ) {
    this.configService = configService;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.cacheStore = cache;
    this.cacheTtlMs = cacheTtlMs;
    this.unknownCacheTtlMs = unknownCacheTtlMs;
    this.timeoutMs = timeoutMs;
    this.loadCache();
  }

  async supportsActive(): Promise<boolean> {
    const resolved = await this.configService.resolveActive();

    if (!resolved.ok) {
      return false;
    }

    const config = resolved.config;

    if (config.imageInput === 'off') {
      return false;
    }

    const key = imageCapabilityKey(config.id, config.model, config.baseUrl);
    const cached = this.cache.get(key);

    if (cached && this.isFresh(cached)) {
      return cached.status === 'supported';
    }

    let pending = this.inFlight.get(key);

    if (!pending) {
      pending = this.probe(config)
        .then((status) => {
          this.commit(key, status);
          return status;
        })
        .finally(() => {
          this.inFlight.delete(key);
        });
      this.inFlight.set(key, pending);
    }

    return (await pending) === 'supported';
  }

  async probeProvider(
    providerId: unknown,
  ): Promise<ProviderImageCapabilityResult> {
    const resolved = await this.configService.resolve(providerId);

    if (!resolved.ok) {
      return { ok: false, errorCode: resolved.errorCode };
    }

    const config = resolved.config;

    if (config.imageInput === 'off') {
      return { ok: true, status: 'unsupported' };
    }

    const status = await this.probe(config);
    this.commit(
      imageCapabilityKey(config.id, config.model, config.baseUrl),
      status,
    );

    return { ok: true, status };
  }

  async probeActive(): Promise<ProviderImageCapabilityResult> {
    const resolved = await this.configService.resolveActive();

    if (!resolved.ok) {
      return { ok: false, errorCode: resolved.errorCode };
    }

    const config = resolved.config;

    if (config.imageInput === 'off') {
      return { ok: true, status: 'unsupported' };
    }

    const status = await this.probe(config);
    this.commit(
      imageCapabilityKey(config.id, config.model, config.baseUrl),
      status,
    );

    return { ok: true, status };
  }

  private ttlFor(status: ImageCapabilityStatus): number {
    return status === 'unknown' ? this.unknownCacheTtlMs : this.cacheTtlMs;
  }

  private isFresh(entry: CacheEntry): boolean {
    return this.now() - entry.checkedAt < this.ttlFor(entry.status);
  }

  private loadCache(): void {
    try {
      const stored = this.cacheStore?.read() ?? {};

      for (const [key, value] of Object.entries(stored)) {
        if (
          isStatus(value.status) &&
          typeof value.checkedAt === 'number' &&
          Number.isFinite(value.checkedAt)
        ) {
          this.cache.set(key, {
            status: value.status,
            checkedAt: value.checkedAt,
          });
        }
      }
    } catch {
      // 缓存读取失败不影响探测。
    }
  }

  private commit(key: string, status: ImageCapabilityStatus): void {
    this.cache.set(key, { status, checkedAt: this.now() });

    try {
      this.cacheStore?.write(
        Object.fromEntries(
          [...this.cache].map(([entryKey, entry]) => [
            entryKey,
            { status: entry.status, checkedAt: entry.checkedAt },
          ]),
        ),
      );
    } catch {
      // 持久化失败时保留内存缓存。
    }
  }

  private async probe(
    config: ProviderRuntimeConfig,
  ): Promise<ImageCapabilityStatus> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let status: ImageCapabilityStatus = 'unknown';

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
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Reply with OK. This is a capability check.',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/webp;base64,${PROBE_IMAGE_WEBP}`,
                    },
                  },
                ],
              },
            ],
            max_tokens: 1,
            stream: false,
          }),
          signal: controller.signal,
        },
      );

      if (response.ok) {
        status = 'supported';
      } else if (
        response.status === 400 ||
        response.status === 415 ||
        response.status === 422 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404
      ) {
        status = 'unsupported';
      }
    } catch {
      status = 'unknown';
    } finally {
      clearTimeout(timeout);
    }

    return status;
  }
}
