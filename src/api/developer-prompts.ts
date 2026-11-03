import type {
  DeveloperPromptsBridge,
  DeveloperPromptsResult,
  PromptCatalogValues,
} from '@/shared/prompts';

const bridge = (window as Window & { tapAlong?: DeveloperPromptsBridge })
  .tapAlong;

export const developerPromptsApi = {
  async get(): Promise<DeveloperPromptsResult> {
    return bridge?.getDeveloperPrompts
      ? bridge.getDeveloperPrompts()
      : { ok: false, errorCode: 'CONFIG_FAILED' };
  },

  async save(prompts: PromptCatalogValues): Promise<DeveloperPromptsResult> {
    return bridge?.saveDeveloperPrompts
      ? bridge.saveDeveloperPrompts(prompts)
      : { ok: false, errorCode: 'CONFIG_FAILED' };
  },

  async reset(): Promise<DeveloperPromptsResult> {
    return bridge?.resetDeveloperPrompts
      ? bridge.resetDeveloperPrompts()
      : { ok: false, errorCode: 'CONFIG_FAILED' };
  },
};
