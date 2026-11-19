import type { AppErrorCode } from '../../shared/errors.ts';
import {
  MODEL_PROVIDER_IDS,
  imageCapabilityKey,
  isValidProviderBaseUrl,
  type ImageCapabilityStatus,
  type ImageInputMode,
  type ModelProviderId,
  type ModelProviderListResult,
  type ModelProviderResult,
  type ModelProviderState,
  type ModelProviderView,
  type SaveModelProviderPayload,
} from '../../shared/providers.ts';

interface StoredProvider {
  name: string;
  model: string;
  baseUrl: string;
  encryptedApiKey?: string;
  imageInput?: ImageInputMode;
}

export interface StoredImageCapability {
  status: ImageCapabilityStatus;
  checkedAt: number;
}

export interface StoredProviderSettings {
  activeProvider: ModelProviderId;
  providers: Partial<Record<ModelProviderId, StoredProvider>>;
  imageCapabilities?: Record<string, StoredImageCapability>;
}

export interface ProviderSettingsStore {
  read(): unknown;
  write(settings: StoredProviderSettings): void;
}

export interface SecretCipher {
  isAvailable(): Promise<boolean>;
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}

export interface ProviderRuntimeConfig {
  id: ModelProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  imageInput: ImageInputMode;
}

export type ProviderResolutionResult =
  | {
      ok: true;
      config: ProviderRuntimeConfig;
    }
  | { ok: false; errorCode: AppErrorCode };

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

const isProviderId = (value: unknown): value is ModelProviderId =>
  typeof value === 'string' &&
  MODEL_PROVIDER_IDS.includes(value as ModelProviderId);

const defaultSettings = (): StoredProviderSettings => ({
  activeProvider: 'deepseek',
  providers: {
    deepseek: {
      name: 'DeepSeek',
      model: 'deepseek-chat',
      baseUrl: DEEPSEEK_BASE_URL,
      imageInput: 'auto',
    },
    custom: {
      name: 'Custom provider',
      model: '',
      baseUrl: '',
      imageInput: 'auto',
    },
  },
});

const normalizeSettings = (raw: unknown): StoredProviderSettings => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultSettings();
  }

  const input = raw as Partial<StoredProviderSettings>;
  const providers =
    input.providers && typeof input.providers === 'object'
      ? input.providers
      : {};
  const imageCapabilities: Record<string, StoredImageCapability> = {};

  if (
    input.imageCapabilities &&
    typeof input.imageCapabilities === 'object' &&
    !Array.isArray(input.imageCapabilities)
  ) {
    for (const [key, value] of Object.entries(input.imageCapabilities)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (value.status === 'supported' ||
          value.status === 'unsupported' ||
          value.status === 'unknown') &&
        typeof value.checkedAt === 'number' &&
        Number.isFinite(value.checkedAt)
      ) {
        imageCapabilities[key] = {
          status: value.status,
          checkedAt: value.checkedAt,
        };
      }
    }
  }

  return {
    activeProvider: isProviderId(input.activeProvider)
      ? input.activeProvider
      : 'deepseek',
    providers: {
      deepseek: {
        name: 'DeepSeek',
        model:
          typeof providers.deepseek?.model === 'string'
            ? providers.deepseek.model
            : 'deepseek-chat',
        baseUrl: DEEPSEEK_BASE_URL,
        imageInput: providers.deepseek?.imageInput === 'off' ? 'off' : 'auto',
        ...(typeof providers.deepseek?.encryptedApiKey === 'string'
          ? { encryptedApiKey: providers.deepseek.encryptedApiKey }
          : {}),
      },
      custom: {
        name:
          typeof providers.custom?.name === 'string'
            ? providers.custom.name
            : 'Custom provider',
        model:
          typeof providers.custom?.model === 'string'
            ? providers.custom.model
            : '',
        baseUrl:
          typeof providers.custom?.baseUrl === 'string'
            ? providers.custom.baseUrl
            : '',
        imageInput: providers.custom?.imageInput === 'off' ? 'off' : 'auto',
        ...(typeof providers.custom?.encryptedApiKey === 'string'
          ? { encryptedApiKey: providers.custom.encryptedApiKey }
          : {}),
      },
    },
    ...(Object.keys(imageCapabilities).length > 0 ? { imageCapabilities } : {}),
  };
};

export class ProviderConfigService {
  private readonly store: ProviderSettingsStore;
  private readonly cipher: SecretCipher;

  constructor(store: ProviderSettingsStore, cipher: SecretCipher) {
    this.store = store;
    this.cipher = cipher;
  }

  async list(): Promise<ModelProviderListResult> {
    try {
      return { ok: true, state: await this.buildState(this.readSettings()) };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  async resolve(id: unknown): Promise<ProviderResolutionResult> {
    if (!isProviderId(id)) {
      return { ok: false, errorCode: 'INVALID_PROVIDER' };
    }

    try {
      const settings = this.readSettings();
      const provider = settings.providers[id];

      if (!provider?.encryptedApiKey) {
        return { ok: false, errorCode: 'PROVIDER_NOT_CONFIGURED' };
      }

      if (!provider.model.trim()) {
        return { ok: false, errorCode: 'INVALID_MODEL' };
      }

      return {
        ok: true,
        config: {
          id,
          baseUrl: id === 'deepseek' ? DEEPSEEK_BASE_URL : provider.baseUrl,
          model: provider.model,
          apiKey: await this.cipher.decrypt(provider.encryptedApiKey),
          imageInput: provider.imageInput ?? 'auto',
        },
      };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  async resolveActive(): Promise<ProviderResolutionResult> {
    try {
      return await this.resolve(this.readSettings().activeProvider);
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  async get(id: unknown): Promise<ModelProviderResult> {
    if (!isProviderId(id)) {
      return { ok: false, errorCode: 'INVALID_PROVIDER' };
    }

    try {
      const state = await this.buildState(this.readSettings());
      return {
        ok: true,
        provider: state.providers.find((provider) => provider.id === id),
      };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  async save(payload: unknown): Promise<ModelProviderListResult> {
    const input = this.parseSavePayload(payload);

    if ('errorCode' in input) {
      return { ok: false, errorCode: input.errorCode };
    }

    try {
      const settings = this.readSettings();
      const previous = settings.providers[input.value.id];
      const apiKey = input.value.apiKey?.trim();

      if (!apiKey && !previous?.encryptedApiKey) {
        return { ok: false, errorCode: 'API_KEY_REQUIRED' };
      }

      let encryptedApiKey = previous?.encryptedApiKey;

      if (apiKey) {
        if (!(await this.isSecureStorageAvailable())) {
          return { ok: false, errorCode: 'SECURE_STORAGE_UNAVAILABLE' };
        }

        encryptedApiKey = await this.cipher.encrypt(apiKey);
      }

      settings.providers[input.value.id] = {
        name:
          input.value.id === 'deepseek'
            ? 'DeepSeek'
            : input.value.name?.trim() || 'Custom provider',
        model: input.value.model.trim(),
        baseUrl:
          input.value.id === 'deepseek'
            ? DEEPSEEK_BASE_URL
            : (input.value.baseUrl ?? '').trim(),
        imageInput: input.value.imageInput === 'off' ? 'off' : 'auto',
        ...(encryptedApiKey ? { encryptedApiKey } : {}),
      };

      const savedProvider = settings.providers[input.value.id]!;
      const cache = settings.imageCapabilities ?? {};

      delete cache[
        imageCapabilityKey(
          input.value.id,
          savedProvider.model,
          savedProvider.baseUrl,
        )
      ];
      if (previous) {
        delete cache[
          imageCapabilityKey(input.value.id, previous.model, previous.baseUrl)
        ];
      }

      // 当前激活供应商还没有 Key 时，保存后自动激活刚配置的这一项。
      // 否则用户配置完仍会停在演示模式，看起来像“保存没生效”。
      const activeProvider = settings.providers[settings.activeProvider];

      if (!activeProvider?.encryptedApiKey) {
        settings.activeProvider = input.value.id;
      }

      this.store.write(settings);

      return { ok: true, state: await this.buildState(settings) };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  async clearKey(id: unknown): Promise<ModelProviderListResult> {
    if (!isProviderId(id)) {
      return { ok: false, errorCode: 'INVALID_PROVIDER' };
    }

    try {
      const settings = this.readSettings();
      const provider = settings.providers[id];

      if (provider) {
        delete provider.encryptedApiKey;
        settings.providers[id] = provider;

        if (settings.imageCapabilities) {
          delete settings.imageCapabilities[
            imageCapabilityKey(id, provider.model, provider.baseUrl)
          ];
        }

        this.store.write(settings);
      }

      return { ok: true, state: await this.buildState(settings) };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  readImageCapabilityCache(): Record<string, StoredImageCapability> {
    const capabilities = this.readSettings().imageCapabilities;
    return capabilities ? { ...capabilities } : {};
  }

  writeImageCapabilityCache(
    cache: Record<string, StoredImageCapability>,
  ): void {
    const settings = this.readSettings();
    settings.imageCapabilities = cache;
    this.store.write(settings);
  }

  async setActive(id: unknown): Promise<ModelProviderListResult> {
    if (!isProviderId(id)) {
      return { ok: false, errorCode: 'INVALID_PROVIDER' };
    }

    try {
      const settings = this.readSettings();
      settings.activeProvider = id;
      this.store.write(settings);
      return { ok: true, state: await this.buildState(settings) };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  private parseSavePayload(
    payload: unknown,
  ): { value: SaveModelProviderPayload } | { errorCode: AppErrorCode } {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { errorCode: 'INVALID_PROVIDER' };
    }

    const input = payload as Partial<SaveModelProviderPayload>;

    if (!isProviderId(input.id)) {
      return { errorCode: 'INVALID_PROVIDER' };
    }

    if (typeof input.model !== 'string' || !input.model.trim()) {
      return { errorCode: 'INVALID_MODEL' };
    }

    if (input.id === 'custom') {
      if (
        typeof input.baseUrl !== 'string' ||
        !isValidProviderBaseUrl(input.baseUrl.trim())
      ) {
        return { errorCode: 'INVALID_BASE_URL' };
      }
    }

    return {
      value: {
        id: input.id,
        name: typeof input.name === 'string' ? input.name : undefined,
        model: input.model,
        baseUrl:
          input.id === 'custom' && typeof input.baseUrl === 'string'
            ? input.baseUrl
            : undefined,
        apiKey: typeof input.apiKey === 'string' ? input.apiKey : undefined,
        imageInput: input.imageInput === 'off' ? 'off' : 'auto',
      },
    };
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

  private async buildState(
    settings: StoredProviderSettings,
  ): Promise<ModelProviderState> {
    const secureStorageAvailable = await this.isSecureStorageAvailable();
    const providers: ModelProviderView[] = MODEL_PROVIDER_IDS.map((id) => {
      const provider =
        settings.providers[id] ?? defaultSettings().providers[id]!;

      return {
        id,
        name: id === 'deepseek' ? 'DeepSeek' : provider.name,
        model: provider.model,
        baseUrl: provider.baseUrl,
        configured: Boolean(provider.encryptedApiKey),
        active: settings.activeProvider === id,
        isCustom: id === 'custom',
        imageInput: provider.imageInput ?? 'auto',
        imageCapability:
          settings.imageCapabilities?.[
            imageCapabilityKey(id, provider.model, provider.baseUrl)
          ]?.status ?? 'unknown',
      };
    });

    return {
      providers,
      activeProvider: settings.activeProvider,
      secureStorageAvailable,
    };
  }
}
