import type { DeveloperModeResult, SettingsBridge } from '@/shared/settings';

const bridge = (window as Window & { tapAlong?: SettingsBridge }).tapAlong;

let mockDeveloperMode = false;

export const settingsApi = {
  async getDeveloperMode(): Promise<DeveloperModeResult> {
    if (bridge?.getDeveloperMode) {
      return bridge.getDeveloperMode();
    }

    return { ok: true, enabled: mockDeveloperMode };
  },

  async setDeveloperMode(enabled: boolean): Promise<DeveloperModeResult> {
    if (bridge?.setDeveloperMode) {
      return bridge.setDeveloperMode(enabled);
    }

    mockDeveloperMode = enabled;
    return { ok: true, enabled };
  },
};
