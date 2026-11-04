import type {
  SaveWebSearchPayload,
  WebSearchSettingsResult,
  WebSearchTestResult,
} from '@/shared/search';
import type { TapAlongBridge } from '@/shared/pages';

const bridge = (window as Window & { tapAlong?: TapAlongBridge }).tapAlong;

export const searchApi = {
  async get(): Promise<WebSearchSettingsResult> {
    return bridge?.getSearchSettings
      ? bridge.getSearchSettings()
      : { ok: false, errorCode: 'CONFIG_FAILED' };
  },

  async save(payload: SaveWebSearchPayload): Promise<WebSearchSettingsResult> {
    return bridge?.saveSearchSettings
      ? bridge.saveSearchSettings(payload)
      : { ok: false, errorCode: 'CONFIG_FAILED' };
  },

  async clearKey(): Promise<WebSearchSettingsResult> {
    return bridge?.clearSearchKey
      ? bridge.clearSearchKey()
      : { ok: false, errorCode: 'CONFIG_FAILED' };
  },

  async test(): Promise<WebSearchTestResult> {
    return bridge?.testSearch
      ? bridge.testSearch()
      : { ok: false, errorCode: 'CONFIG_FAILED' };
  },
};
