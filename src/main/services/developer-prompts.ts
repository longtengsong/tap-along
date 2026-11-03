import type {
  DeveloperPromptProfile,
  DeveloperPromptsResult,
  PromptCatalogValues,
} from '../../shared/prompts.ts';
import { PROMPT_CATALOG, PROMPT_VERSION } from '../prompts/catalog.ts';
import type { DeveloperModeService } from './developer-mode.ts';

const MAX_PROMPT_PROFILE_LENGTH = 64_000;

export interface DeveloperPromptStore {
  read(): unknown;
  write(profile: DeveloperPromptProfile): void;
  clear(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readString = (
  value: Record<string, unknown>,
  key: string,
): string | null => {
  const field = value[key];
  return typeof field === 'string' ? field : null;
};

const normalizePromptCatalog = (value: unknown): PromptCatalogValues | null => {
  if (
    !isRecord(value) ||
    !isRecord(value.provider) ||
    !isRecord(value.teacher)
  ) {
    return null;
  }

  const { provider, teacher } = value;
  const context = teacher.context;
  const maintenanceAction = teacher.maintenanceAction;

  if (!isRecord(context) || !isRecord(maintenanceAction)) {
    return null;
  }

  const connectionTest = readString(provider, 'connectionTest');
  const system = readString(teacher, 'system');
  const languagePolicy = readString(teacher, 'languagePolicy');
  const resume = readString(teacher, 'resume');
  const maintenance = readString(teacher, 'maintenance');
  const contextBoundary = readString(teacher, 'contextBoundary');
  const compressedContextPolicy = readString(
    teacher,
    'compressedContextPolicy',
  );
  const currentPage = readString(context, 'currentPage');
  const closedPage = readString(context, 'closedPage');
  const targetPage = readString(context, 'targetPage');
  const edit = readString(maintenanceAction, 'edit');
  const append = readString(maintenanceAction, 'append');

  if (
    connectionTest === null ||
    system === null ||
    languagePolicy === null ||
    resume === null ||
    maintenance === null ||
    contextBoundary === null ||
    compressedContextPolicy === null ||
    currentPage === null ||
    closedPage === null ||
    targetPage === null ||
    edit === null ||
    append === null
  ) {
    return null;
  }

  return {
    provider: { connectionTest },
    teacher: {
      system,
      languagePolicy,
      resume,
      maintenance,
      contextBoundary,
      compressedContextPolicy,
      context: {
        currentPage,
        closedPage,
        targetPage,
      },
      maintenanceAction: {
        edit,
        append,
      },
    },
  };
};

const readStoredProfile = (value: unknown): DeveloperPromptProfile | null => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.basePromptVersion !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null;
  }

  const prompts = normalizePromptCatalog(value.prompts);
  return prompts
    ? {
        schemaVersion: 1,
        basePromptVersion: value.basePromptVersion,
        prompts,
        updatedAt: value.updatedAt,
      }
    : null;
};

export class DeveloperPromptConfigService {
  private readonly developerMode: Pick<DeveloperModeService, 'get'>;
  private readonly store: DeveloperPromptStore;

  constructor(
    developerMode: Pick<DeveloperModeService, 'get'>,
    store: DeveloperPromptStore,
  ) {
    this.developerMode = developerMode;
    this.store = store;
  }

  private isDeveloperModeEnabled() {
    const result = this.developerMode.get();
    return result.ok && result.enabled === true;
  }

  get(): DeveloperPromptsResult {
    try {
      const profile = readStoredProfile(this.store.read());

      return {
        ok: true,
        prompts: profile?.prompts ?? PROMPT_CATALOG,
        basePromptVersion: profile?.basePromptVersion ?? PROMPT_VERSION,
        hasSavedProfile: profile !== null,
      };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  save(value: unknown): DeveloperPromptsResult {
    if (!this.isDeveloperModeEnabled()) {
      return { ok: false, errorCode: 'DEVELOPER_MODE_REQUIRED' };
    }

    const prompts = normalizePromptCatalog(value);
    if (!prompts) {
      return { ok: false, errorCode: 'INVALID_PROMPT_PROFILE' };
    }

    if (JSON.stringify(prompts).length > MAX_PROMPT_PROFILE_LENGTH) {
      return { ok: false, errorCode: 'PROMPT_PROFILE_TOO_LARGE' };
    }

    const profile: DeveloperPromptProfile = {
      schemaVersion: 1,
      basePromptVersion: PROMPT_VERSION,
      prompts,
      updatedAt: new Date().toISOString(),
    };

    try {
      this.store.write(profile);
      return {
        ok: true,
        prompts,
        basePromptVersion: PROMPT_VERSION,
        hasSavedProfile: true,
      };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  reset(): DeveloperPromptsResult {
    if (!this.isDeveloperModeEnabled()) {
      return { ok: false, errorCode: 'DEVELOPER_MODE_REQUIRED' };
    }

    try {
      this.store.clear();
      return {
        ok: true,
        prompts: PROMPT_CATALOG,
        basePromptVersion: PROMPT_VERSION,
        hasSavedProfile: false,
      };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  resolve(): PromptCatalogValues {
    if (!this.isDeveloperModeEnabled()) {
      return PROMPT_CATALOG;
    }

    try {
      return readStoredProfile(this.store.read())?.prompts ?? PROMPT_CATALOG;
    } catch {
      return PROMPT_CATALOG;
    }
  }
}
