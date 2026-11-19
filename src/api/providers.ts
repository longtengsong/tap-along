import type { ProviderBridge } from '@/shared/providers';
import {
  isValidProviderBaseUrl,
  type ModelProviderId,
  type ModelProviderListResult,
  type ModelProviderResult,
  type ModelProviderState,
  type ProviderConnectionResult,
  type ProviderImageCapabilityResult,
  type SaveModelProviderPayload,
} from '@/shared/providers';

const bridge = (window as Window & { tapAlong?: ProviderBridge }).tapAlong;

let mockState: ModelProviderState = {
  activeProvider: 'deepseek',
  secureStorageAvailable: true,
  providers: [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
      configured: false,
      active: true,
      isCustom: false,
      imageInput: 'auto',
      imageCapability: 'unknown',
    },
    {
      id: 'custom',
      name: 'Custom provider',
      model: '',
      baseUrl: '',
      configured: false,
      active: false,
      isCustom: true,
      imageInput: 'auto',
      imageCapability: 'unknown',
    },
  ],
};

const cloneState = (): ModelProviderState => ({
  ...mockState,
  providers: mockState.providers.map((provider) => ({ ...provider })),
});

export const providerApi = {
  async list(): Promise<ModelProviderListResult> {
    if (bridge?.listProviders) {
      return bridge.listProviders();
    }

    return { ok: true, state: cloneState() };
  },

  async get(id: ModelProviderId): Promise<ModelProviderResult> {
    if (bridge?.getProvider) {
      return bridge.getProvider(id);
    }

    return {
      ok: true,
      provider: cloneState().providers.find((provider) => provider.id === id),
    };
  },

  async save(
    payload: SaveModelProviderPayload,
  ): Promise<ModelProviderListResult> {
    if (bridge?.saveProvider) {
      return bridge.saveProvider(payload);
    }

    if (
      payload.id === 'custom' &&
      !isValidProviderBaseUrl(payload.baseUrl ?? '')
    ) {
      return { ok: false, errorCode: 'INVALID_BASE_URL' };
    }

    if (!payload.model.trim()) {
      return { ok: false, errorCode: 'INVALID_MODEL' };
    }

    const current = mockState.providers.find(
      (provider) => provider.id === payload.id,
    );

    if (!current?.configured && !payload.apiKey?.trim()) {
      return { ok: false, errorCode: 'API_KEY_REQUIRED' };
    }

    mockState = {
      ...mockState,
      providers: mockState.providers.map((provider) =>
        provider.id === payload.id
          ? {
              ...provider,
              name:
                payload.id === 'deepseek'
                  ? 'DeepSeek'
                  : payload.name?.trim() || 'Custom provider',
              model: payload.model.trim(),
              baseUrl:
                payload.id === 'deepseek'
                  ? 'https://api.deepseek.com'
                  : (payload.baseUrl ?? '').trim(),
              configured: true,
              imageInput: payload.imageInput === 'off' ? 'off' : 'auto',
              imageCapability: 'unknown',
            }
          : provider,
      ),
    };

    return { ok: true, state: cloneState() };
  },

  async clearKey(id: ModelProviderId): Promise<ModelProviderListResult> {
    if (bridge?.clearProviderKey) {
      return bridge.clearProviderKey(id);
    }

    mockState = {
      ...mockState,
      providers: mockState.providers.map((provider) =>
        provider.id === id
          ? { ...provider, configured: false, imageCapability: 'unknown' }
          : provider,
      ),
    };
    return { ok: true, state: cloneState() };
  },

  async setActive(id: ModelProviderId): Promise<ModelProviderListResult> {
    if (bridge?.setActiveProvider) {
      return bridge.setActiveProvider(id);
    }

    mockState = {
      ...mockState,
      activeProvider: id,
      providers: mockState.providers.map((provider) => ({
        ...provider,
        active: provider.id === id,
      })),
    };
    return { ok: true, state: cloneState() };
  },

  async test(id: ModelProviderId): Promise<ProviderConnectionResult> {
    if (bridge?.testProvider) {
      return bridge.testProvider(id);
    }

    return mockState.providers.find((provider) => provider.id === id)
      ?.configured
      ? { ok: true }
      : { ok: false, errorCode: 'PROVIDER_NOT_CONFIGURED' };
  },

  async probeImages(
    id: ModelProviderId,
  ): Promise<ProviderImageCapabilityResult> {
    if (bridge?.probeProviderImages) {
      return bridge.probeProviderImages(id);
    }

    const provider = mockState.providers.find((item) => item.id === id);

    if (!provider?.configured) {
      return { ok: false, errorCode: 'PROVIDER_NOT_CONFIGURED' };
    }

    const status = 'supported';
    mockState = {
      ...mockState,
      providers: mockState.providers.map((item) =>
        item.id === id ? { ...item, imageCapability: status } : item,
      ),
    };

    return { ok: true, status };
  },
};
