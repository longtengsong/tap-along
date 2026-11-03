import type { AppErrorCode } from './errors.ts';

export interface DeveloperModeResult {
  ok: boolean;
  enabled?: boolean;
  errorCode?: AppErrorCode;
}

export const SETTINGS_CHANNELS = {
  getDeveloperMode: 'settings:get-developer-mode',
  setDeveloperMode: 'settings:set-developer-mode',
} as const;

export interface SettingsBridge {
  getDeveloperMode?: () => Promise<DeveloperModeResult>;
  setDeveloperMode?: (enabled: boolean) => Promise<DeveloperModeResult>;
}
