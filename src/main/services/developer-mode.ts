import type { DeveloperModeResult } from '../../shared/settings.ts';

export interface DeveloperModeStore {
  read(): unknown;
  write(enabled: boolean): void;
}

export class DeveloperModeService {
  private readonly store: DeveloperModeStore;

  constructor(store: DeveloperModeStore) {
    this.store = store;
  }

  get(): DeveloperModeResult {
    try {
      return { ok: true, enabled: this.store.read() === true };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }

  set(enabled: unknown): DeveloperModeResult {
    if (typeof enabled !== 'boolean') {
      return { ok: false, errorCode: 'INVALID_BODY' };
    }

    try {
      this.store.write(enabled);
      return { ok: true, enabled };
    } catch {
      return { ok: false, errorCode: 'CONFIG_FAILED' };
    }
  }
}
