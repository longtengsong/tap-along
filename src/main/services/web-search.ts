import type { AppErrorCode } from '../../shared/errors.ts';
import type {
  ResearchEvidence,
  TeacherSource,
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

interface WebSearchOptions {
  configService: Pick<SearchConfigService, 'resolve'>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

const TAVILY_URL = 'https://api.tavily.com/search';
const MAX_QUERIES = 3;
const MAX_SOURCES = 5;
const MAX_SNIPPET_LENGTH = 1200;

const providerErrorForStatus = (status: number): AppErrorCode => {
  if (status === 401 || status === 403) {
    return 'SEARCH_UNAUTHORIZED';
  }

  if (status === 429) {
    return 'SEARCH_RATE_LIMITED';
  }

  if (status === 408) {
    return 'SEARCH_TIMEOUT';
  }

  return 'SEARCH_REQUEST_FAILED';
};

const readString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const readScore = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const createAbortError = () => {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
};

export class TavilySearchProvider {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = globalThis.fetch) {
    this.fetchImpl = fetchImpl;
  }

  async search(
    query: string,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<WebSearchItem[]> {
    let response: Awaited<ReturnType<FetchLike>>;

    try {
      response = await this.fetchImpl(TAVILY_URL, {
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
        signal,
      });
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

    const rawResults = (payload as { results?: unknown }).results;

    if (!Array.isArray(rawResults)) {
      return [];
    }

    return rawResults.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }

      const record = entry as Record<string, unknown>;
      const normalizedUrl = normalizeHttpUrl(record.url);
      const domain = normalizedUrl ? domainFromUrl(normalizedUrl) : null;

      if (!normalizedUrl || !domain) {
        return [];
      }

      const title = readString(record.title).trim() || domain;
      const snippet = (
        readString(record.raw_content) || readString(record.content)
      )
        .trim()
        .slice(0, MAX_SNIPPET_LENGTH);
      const publishedAt = readString(record.published_date).trim();

      return [
        {
          title: title.slice(0, 300),
          url: normalizedUrl,
          domain,
          snippet,
          ...(publishedAt ? { publishedAt: publishedAt.slice(0, 40) } : {}),
          tier: classifyDomain(domain),
          score: readScore(record.score),
        },
      ];
    });
  }
}

export class WebSearchService {
  private readonly configService: Pick<SearchConfigService, 'resolve'>;
  private readonly provider: TavilySearchProvider;
  private readonly timeoutMs: number;

  constructor({
    configService,
    fetchImpl = globalThis.fetch,
    timeoutMs = 20_000,
  }: WebSearchOptions) {
    this.configService = configService;
    this.provider = new TavilySearchProvider(fetchImpl);
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

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();

    if (signal?.aborted) {
      controller.abort();
    } else {
      signal?.addEventListener('abort', abortFromCaller, { once: true });
    }

    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let results: WebSearchItem[];

    try {
      const batches = await Promise.all(
        normalizedQueries.map((query) =>
          this.provider.search(query, resolved.apiKey, controller.signal),
        ),
      );
      results = batches.flat();
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
      await this.provider.search(
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
}
