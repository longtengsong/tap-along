import type { AppErrorCode } from './errors.ts';

export interface PromptCatalogValues {
  provider: {
    connectionTest: string;
  };
  teacher: {
    system: string;
    languagePolicy: string;
    resume: string;
    maintenance: string;
    contextBoundary: string;
    compressedContextPolicy: string;
    context: {
      currentPage: string;
      closedPage: string;
      targetPage: string;
    };
    maintenanceAction: {
      edit: string;
      append: string;
    };
  };
}

export interface DeveloperPromptProfile {
  schemaVersion: 1;
  basePromptVersion: string;
  prompts: PromptCatalogValues;
  updatedAt: string;
}

export interface DeveloperPromptsResult {
  ok: boolean;
  prompts?: PromptCatalogValues;
  basePromptVersion?: string;
  hasSavedProfile?: boolean;
  errorCode?: AppErrorCode;
}

export const DEVELOPER_PROMPTS_CHANNELS = {
  get: 'developer-prompts:get',
  save: 'developer-prompts:save',
  reset: 'developer-prompts:reset',
} as const;

export interface DeveloperPromptsBridge {
  getDeveloperPrompts?: () => Promise<DeveloperPromptsResult>;
  saveDeveloperPrompts?: (
    prompts: PromptCatalogValues,
  ) => Promise<DeveloperPromptsResult>;
  resetDeveloperPrompts?: () => Promise<DeveloperPromptsResult>;
}
