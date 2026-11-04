import type { AppErrorCode } from './errors.ts';

export const WEB_SEARCH_PROVIDER_IDS = ['tavily'] as const;

export type WebSearchProviderId = (typeof WEB_SEARCH_PROVIDER_IDS)[number];

export interface TeacherSource {
  index: number;
  title: string;
  url: string;
  domain: string;
  publishedAt?: string;
}

export interface ResearchEvidence {
  source: TeacherSource;
  snippet: string;
}

export interface WebSearchSettingsView {
  enabled: boolean;
  provider: WebSearchProviderId;
  configured: boolean;
  secureStorageAvailable: boolean;
}

export interface SaveWebSearchPayload {
  enabled: boolean;
  apiKey?: string;
}

export interface WebSearchSettingsResult {
  ok: boolean;
  settings?: WebSearchSettingsView;
  errorCode?: AppErrorCode;
}

export interface WebSearchTestResult {
  ok: boolean;
  errorCode?: AppErrorCode;
}

export const SEARCH_CHANNELS = {
  get: 'search:get',
  save: 'search:save',
  clearKey: 'search:clear-key',
  test: 'search:test',
} as const;

export interface SearchBridge {
  getSearchSettings?: () => Promise<WebSearchSettingsResult>;
  saveSearchSettings?: (
    payload: SaveWebSearchPayload,
  ) => Promise<WebSearchSettingsResult>;
  clearSearchKey?: () => Promise<WebSearchSettingsResult>;
  testSearch?: () => Promise<WebSearchTestResult>;
}
