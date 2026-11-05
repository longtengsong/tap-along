import type { AppErrorCode } from '../../shared/errors.ts';
import type {
  SaveWebSearchPayload,
  WebSearchProviderId,
  WebSearchSettingsResult,
  WebSearchSettingsView,
} from '../../shared/search.ts';
import type { SecretCipher } from './providers.ts';

export interface StoredWebSearchSettings {
  enabled: boolean;
  deepseekEnabled: boolean;
  provider: WebSearchProviderId;
  encryptedApiKey?: string;
}

export interface SearchSettingsStore {
  read(): unknown;
  write(settings: StoredWebSearchSettings): void;
}

export interface SearchProviderCredential {
  provider: WebSearchProviderId;
  apiKey: string;
}

export type SearchResolution =
  | {
      ok: true;
      provider: WebSearchProviderId;
      apiKey: string;
      fallback?: SearchProviderCredential;
    }
  | { ok: false; errorCode: AppErrorCode };

export interface SearchConfigOptions {
  /** 读取已保存的 DeepSeek 模型 Key；未配置或不可用时返回 null。 */
  deepseekKeyProvider?: () => Promise<string | null>;
}

const defaultSettings = (): StoredWebSearchSettings => ({
  enabled: true,
  deepseekEnabled: true,
  provider: 'deepseek',
});

const normalizeSettings = (raw: unknown): StoredWebSearchSettings => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultSettings();
  }

  const input = raw as Partial<StoredWebSearchSettings>;
  const deepseekEnabled =
    typeof input.deepseekEnabled === 'boolean' ? input.deepseekEnabled : true;

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    deepseekEnabled,
    provider: deepseekEnabled ? 'deepseek' : 'tavily',
    ...(typeof input.encryptedApiKey === 'string' &&
    input.encryptedApiKey.trim()
      ? { encryptedApiKey: input.encryptedApiKey }
      : {}),
  };
};

export class SearchConfigService {
  private readonly store: SearchSettingsStore;
  private readonly cipher: SecretCipher;
  private readonly options: SearchConfigOptions;

  constructor(
    store: SearchSettingsStore,
    cipher: SecretCipher,
    options: SearchConfigOptions = {},
  ) {
    this.store = store;
    this.cipher = cipher;
    this.options = options;
  }

  async get(): Promise<WebSearchSettingsResult> {
    try {
      return { ok: true, settings: await this.buildView(this.readSettings()) };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  async save(payload: unknown): Promise<WebSearchSettingsResult> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }

    const input = payload as Partial<SaveWebSearchPayload>;

    if (typeof input.enabled !== 'boolean') {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }

    if (
      input.deepseekEnabled !== undefined &&
      typeof input.deepseekEnabled !== 'boolean'
    ) {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }

    try {
      const settings = this.readSettings();
      const apiKey =
        typeof input.apiKey === 'string' ? input.apiKey.trim() : '';

      if (apiKey) {
        if (!(await this.isSecureStorageAvailable())) {
          return { ok: false, errorCode: 'SECURE_STORAGE_UNAVAILABLE' };
        }

        settings.encryptedApiKey = await this.cipher.encrypt(apiKey);
      }

      settings.enabled = input.enabled;

      if (typeof input.deepseekEnabled === 'boolean') {
        settings.deepseekEnabled = input.deepseekEnabled;
      }

      settings.provider = settings.deepseekEnabled ? 'deepseek' : 'tavily';
      this.store.write(settings);

      return { ok: true, settings: await this.buildView(settings) };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  async clearKey(): Promise<WebSearchSettingsResult> {
    try {
      const settings = this.readSettings();
      delete settings.encryptedApiKey;
      this.store.write(settings);
      return { ok: true, settings: await this.buildView(settings) };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  async resolve(): Promise<SearchResolution> {
    try {
      const settings = this.readSettings();

      if (!settings.enabled) {
        return { ok: false, errorCode: 'SEARCH_DISABLED' };
      }

      const deepseekKey = settings.deepseekEnabled
        ? await this.readDeepseekKey()
        : null;
      const tavilyKey = settings.encryptedApiKey
        ? await this.cipher.decrypt(settings.encryptedApiKey)
        : null;

      if (deepseekKey) {
        return {
          ok: true,
          provider: 'deepseek',
          apiKey: deepseekKey,
          ...(tavilyKey
            ? { fallback: { provider: 'tavily' as const, apiKey: tavilyKey } }
            : {}),
        };
      }

      if (tavilyKey) {
        return { ok: true, provider: 'tavily', apiKey: tavilyKey };
      }

      return { ok: false, errorCode: 'SEARCH_NOT_CONFIGURED' };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  private readSettings() {
    return normalizeSettings(this.store.read());
  }

  private async readDeepseekKey(): Promise<string | null> {
    if (!this.options.deepseekKeyProvider) {
      return null;
    }

    try {
      const key = await this.options.deepseekKeyProvider();
      return typeof key === 'string' && key.trim() ? key : null;
    } catch {
      return null;
    }
  }

  private async isSecureStorageAvailable() {
    try {
      return await this.cipher.isAvailable();
    } catch {
      return false;
    }
  }

  private async buildView(
    settings: StoredWebSearchSettings,
  ): Promise<WebSearchSettingsView> {
    const deepseekConfigured = Boolean(await this.readDeepseekKey());
    const tavilyConfigured = Boolean(settings.encryptedApiKey);

    return {
      enabled: settings.enabled,
      deepseekEnabled: settings.deepseekEnabled,
      provider: settings.deepseekEnabled ? 'deepseek' : 'tavily',
      deepseekConfigured,
      tavilyConfigured,
      configured:
        (settings.deepseekEnabled && deepseekConfigured) || tavilyConfigured,
      secureStorageAvailable: await this.isSecureStorageAvailable(),
    };
  }
}
