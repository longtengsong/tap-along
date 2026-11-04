import type { AppErrorCode } from '../../shared/errors.ts';
import type {
  SaveWebSearchPayload,
  WebSearchSettingsResult,
  WebSearchSettingsView,
} from '../../shared/search.ts';
import type { SecretCipher } from './providers.ts';

export interface StoredWebSearchSettings {
  enabled: boolean;
  provider: 'tavily';
  encryptedApiKey?: string;
}

export interface SearchSettingsStore {
  read(): unknown;
  write(settings: StoredWebSearchSettings): void;
}

export type SearchResolution =
  | { ok: true; apiKey: string }
  | { ok: false; errorCode: AppErrorCode };

const defaultSettings = (): StoredWebSearchSettings => ({
  enabled: true,
  provider: 'tavily',
});

const normalizeSettings = (raw: unknown): StoredWebSearchSettings => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultSettings();
  }

  const input = raw as Partial<StoredWebSearchSettings>;

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    provider: 'tavily',
    ...(typeof input.encryptedApiKey === 'string' &&
    input.encryptedApiKey.trim()
      ? { encryptedApiKey: input.encryptedApiKey }
      : {}),
  };
};

export class SearchConfigService {
  private readonly store: SearchSettingsStore;
  private readonly cipher: SecretCipher;

  constructor(store: SearchSettingsStore, cipher: SecretCipher) {
    this.store = store;
    this.cipher = cipher;
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
      settings.provider = 'tavily';
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

      if (!settings.encryptedApiKey) {
        return { ok: false, errorCode: 'SEARCH_NOT_CONFIGURED' };
      }

      return {
        ok: true,
        apiKey: await this.cipher.decrypt(settings.encryptedApiKey),
      };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  private readSettings() {
    return normalizeSettings(this.store.read());
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
    return {
      enabled: settings.enabled,
      provider: 'tavily',
      configured: Boolean(settings.encryptedApiKey),
      secureStorageAvailable: await this.isSecureStorageAvailable(),
    };
  }
}
