import type { AppErrorCode } from '../../shared/errors.ts';
import type {
  ResearchEvidence,
  TeacherSource,
  WebSearchProviderId,
  WebSearchTestResult,
} from '../../shared/search.ts';
import type { SearchConfigService } from './search-config.ts';
import {
  classifyDomain,
  domainFromUrl,
  isEvidenceSufficient,
  normalizeHttpUrl,
  rankSearchItems,
  type WebSearchItem,
} from './search-policy.ts';

type FetchLike = typeof fetch;

export class SearchError extends Error {
  readonly errorCode: AppErrorCode;

  constructor(errorCode: AppErrorCode) {
    super('联网检索失败');
    this.name = 'SearchError';
    this.errorCode = errorCode;
  }
}

export interface SearchProvider {
  search(
    query: string,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<WebSearchItem[]>;
}

interface WebSearchOptions {
  configService: Pick<SearchConfigService, 'resolve'>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  deepseekBaseUrl?: string;
}

const TAVILY_URL = 'https://api.tavily.com/search';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const MAX_QUERIES = 3;
const MAX_SOURCES = 5;
const MAX_SNIPPET_LENGTH = 1200;

const FALLBACK_ERROR_CODES = new Set<AppErrorCode>([
  'SEARCH_UNAUTHORIZED',
  'SEARCH_RATE_LIMITED',
  'SEARCH_INSUFFICIENT_BALANCE',
  'SEARCH_TIMEOUT',
  'SEARCH_NETWORK_ERROR',
  'SEARCH_REQUEST_FAILED',
]);

const providerErrorForStatus = (status: number): AppErrorCode => {
  if (status === 401 || status === 403) {
    return 'SEARCH_UNAUTHORIZED';
  }

  if (status === 402) {
    return 'SEARCH_INSUFFICIENT_BALANCE';
  }

  if (status === 429) {
    return 'SEARCH_RATE_LIMITED';
  }

  if (status === 408 || status === 504) {
    return 'SEARCH_TIMEOUT';
  }

  return 'SEARCH_REQUEST_FAILED';
};

const readString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const readScore = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const readAuthority = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : -1;

const createAbortError = () => {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
};

const readResults = async (
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<unknown[]> => {
  let response: Awaited<ReturnType<FetchLike>>;

  try {
    response = await fetchImpl(url, { ...init, signal });
  } catch (error) {
    if (signal.aborted) {
      throw createAbortError();
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new SearchError('SEARCH_TIMEOUT');
    }

    throw new SearchError('SEARCH_NETWORK_ERROR');
  }

  if (!response.ok) {
    throw new SearchError(providerErrorForStatus(response.status));
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new SearchError('SEARCH_REQUEST_FAILED');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SearchError('SEARCH_REQUEST_FAILED');
  }

  const results = (payload as { results?: unknown }).results;

  return Array.isArray(results) ? results : [];
};

interface ItemInput {
  url: unknown;
  title: unknown;
  snippet: unknown;
  publishedAt: string;
  score: number;
  authoritative?: boolean;
}

const buildItem = (input: ItemInput): WebSearchItem[] => {
  const normalizedUrl = normalizeHttpUrl(input.url);
  const domain = normalizedUrl ? domainFromUrl(normalizedUrl) : null;

  if (!normalizedUrl || !domain) {
    return [];
  }

  const title = readString(input.title).trim() || domain;
  const snippet = readString(input.snippet).trim().slice(0, MAX_SNIPPET_LENGTH);
  const publishedAt = input.publishedAt.trim();

  return [
    {
      title: title.slice(0, 300),
      url: normalizedUrl,
      domain,
      snippet,
      ...(publishedAt ? { publishedAt: publishedAt.slice(0, 40) } : {}),
      // DeepSeek 的权威性评分可以直接提级，其余仍按域名分级。
      tier: input.authoritative ? 'official' : classifyDomain(domain),
      score: input.score,
    },
  ];
};

export class TavilySearchProvider implements SearchProvider {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = globalThis.fetch) {
    this.fetchImpl = fetchImpl;
  }

  async search(
    query: string,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<WebSearchItem[]> {
    const results = await readResults(
      this.fetchImpl,
      TAVILY_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          search_depth: 'advanced',
          max_results: 5,
          include_answer: false,
          include_raw_content: false,
        }),
      },
      signal,
    );

    return results.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }

      const record = entry as Record<string, unknown>;

      return buildItem({
        url: record.url,
        title: record.title,
        snippet: readString(record.raw_content) || readString(record.content),
        publishedAt: readString(record.published_date),
        score: readScore(record.score),
      });
    });
  }
}

export class DeepSeekSearchProvider implements SearchProvider {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(
    fetchImpl: FetchLike = globalThis.fetch,
    baseUrl: string = DEEPSEEK_BASE_URL,
  ) {
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async search(
    query: string,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<WebSearchItem[]> {
    const results = await readResults(
      this.fetchImpl,
      `${this.baseUrl}/v1/tools/search`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          count: 5,
          need_content: false,
        }),
      },
      signal,
    );

    return results.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }

      const record = entry as Record<string, unknown>;

      return buildItem({
        url: record.url,
        title: record.title,
        snippet: readString(record.summary) || readString(record.snippet),
        publishedAt: readString(record.date),
        score: readScore(record.rerank_score),
        authoritative: readAuthority(record.authority) >= 3,
      });
    });
  }
}

export class WebSearchService {
  private readonly configService: Pick<SearchConfigService, 'resolve'>;
  private readonly providers: Record<WebSearchProviderId, SearchProvider>;
  private readonly timeoutMs: number;

  constructor({
    configService,
    fetchImpl = globalThis.fetch,
    timeoutMs = 20_000,
    deepseekBaseUrl,
  }: WebSearchOptions) {
    this.configService = configService;
    this.providers = {
      deepseek: new DeepSeekSearchProvider(fetchImpl, deepseekBaseUrl),
      tavily: new TavilySearchProvider(fetchImpl),
    };
    this.timeoutMs = timeoutMs;
  }

  async search(
    queries: string[],
    signal?: AbortSignal,
  ): Promise<ResearchEvidence[]> {
    const resolved = await this.configService.resolve();

    if (!resolved.ok) {
      throw new SearchError(resolved.errorCode);
    }

    const normalizedQueries = [
      ...new Set(
        queries.map((query) => query.trim().slice(0, 120)).filter(Boolean),
      ),
    ].slice(0, MAX_QUERIES);

    if (normalizedQueries.length === 0) {
      throw new SearchError('SEARCH_REQUEST_FAILED');
    }

    let results: WebSearchItem[];

    try {
      results = await this.runQueries(
        resolved.provider,
        resolved.apiKey,
        normalizedQueries,
        signal,
      );
    } catch (error) {
      const fallback = resolved.fallback;

      if (
        !fallback ||
        signal?.aborted ||
        !(error instanceof SearchError) ||
        !FALLBACK_ERROR_CODES.has(error.errorCode)
      ) {
        throw error;
      }

      results = await this.runQueries(
        fallback.provider,
        fallback.apiKey,
        normalizedQueries,
        signal,
      );
    }

    const deduped = new Map<string, WebSearchItem>();

    for (const item of results) {
      const key = normalizeHttpUrl(item.url);

      if (key && !deduped.has(key)) {
        deduped.set(key, item);
      }
    }

    const ranked = rankSearchItems([...deduped.values()]).slice(0, MAX_SOURCES);

    if (ranked.length === 0) {
      throw new SearchError('SEARCH_NO_RESULTS');
    }

    if (!isEvidenceSufficient(ranked)) {
      throw new SearchError('RESEARCH_NO_EVIDENCE');
    }

    return ranked.map((item, index) => {
      const source: TeacherSource = {
        index: index + 1,
        title: item.title,
        url: item.url,
        domain: item.domain,
        ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
      };

      return {
        source,
        snippet: item.snippet,
      };
    });
  }

  async test(): Promise<WebSearchTestResult> {
    const resolved = await this.configService.resolve();

    if (!resolved.ok) {
      return { ok: false, errorCode: resolved.errorCode };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(this.timeoutMs, 15_000),
    );

    try {
      await this.providers[resolved.provider].search(
        'TapAlong reading companion',
        resolved.apiKey,
        controller.signal,
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof SearchError) {
        return { ok: false, errorCode: error.errorCode };
      }

      return {
        ok: false,
        errorCode: controller.signal.aborted
          ? 'SEARCH_TIMEOUT'
          : 'SEARCH_NETWORK_ERROR',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async runQueries(
    providerId: WebSearchProviderId,
    apiKey: string,
    queries: string[],
    signal?: AbortSignal,
  ): Promise<WebSearchItem[]> {
    const provider = this.providers[providerId];
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();

    if (signal?.aborted) {
      controller.abort();
    } else {
      signal?.addEventListener('abort', abortFromCaller, { once: true });
    }

    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const batches = await Promise.all(
        queries.map((query) =>
          provider.search(query, apiKey, controller.signal),
        ),
      );
      return batches.flat();
    } catch (error) {
      if (signal?.aborted) {
        throw createAbortError();
      }

      if (controller.signal.aborted) {
        throw new SearchError('SEARCH_TIMEOUT');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }
}
