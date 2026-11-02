import type { AppErrorCode } from './errors.ts';

export const MODEL_PROVIDER_IDS = ['deepseek', 'custom'] as const;

export type ModelProviderId = (typeof MODEL_PROVIDER_IDS)[number];

export const isValidProviderBaseUrl = (value: string) => {
  try {
    const url = new URL(value);
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

    if (url.username || url.password) {
      return false;
    }

    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && localHosts.has(url.hostname))
    );
  } catch {
    return false;
  }
};

export interface ModelProviderView {
  id: ModelProviderId;
  name: string;
  model: string;
  baseUrl: string;
  configured: boolean;
  active: boolean;
  isCustom: boolean;
}

export interface ModelProviderState {
  providers: ModelProviderView[];
  activeProvider: ModelProviderId;
  secureStorageAvailable: boolean;
}

export interface ModelProviderResult {
  ok: boolean;
  provider?: ModelProviderView;
  errorCode?: AppErrorCode;
}

export interface ModelProviderListResult {
  ok: boolean;
  state?: ModelProviderState;
  errorCode?: AppErrorCode;
}

export interface ProviderConnectionResult {
  ok: boolean;
  errorCode?: AppErrorCode;
}

export interface SaveModelProviderPayload {
  id: ModelProviderId;
  name?: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export const PROVIDER_CHANNELS = {
  list: 'providers:list',
  get: 'providers:get',
  save: 'providers:save',
  clearKey: 'providers:clear-key',
  setActive: 'providers:set-active',
  test: 'providers:test',
} as const;

export interface ProviderBridge {
  listProviders?: () => Promise<ModelProviderListResult>;
  getProvider?: (id: ModelProviderId) => Promise<ModelProviderResult>;
  saveProvider?: (
    payload: SaveModelProviderPayload,
  ) => Promise<ModelProviderListResult>;
  clearProviderKey?: (id: ModelProviderId) => Promise<ModelProviderListResult>;
  setActiveProvider?: (id: ModelProviderId) => Promise<ModelProviderListResult>;
  testProvider?: (id: ModelProviderId) => Promise<ProviderConnectionResult>;
}
