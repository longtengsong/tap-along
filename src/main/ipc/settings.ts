import type { IpcMain, WebContents } from 'electron';
import { SETTINGS_CHANNELS } from '../../shared/settings.ts';
import type { DeveloperModeService } from '../services/developer-mode.ts';

type DevToolsTarget = Pick<WebContents, 'openDevTools' | 'closeDevTools'>;

const applyDeveloperMode = (target: DevToolsTarget, enabled: boolean) => {
  try {
    if (enabled) {
      target.openDevTools({ mode: 'detach' });
    } else {
      target.closeDevTools();
    }
  } catch (error) {
    console.error('Failed to update developer tools.', error);
  }
};

export const registerSettingsHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  developerModeService: DeveloperModeService,
) => {
  ipcMain.handle(SETTINGS_CHANNELS.getDeveloperMode, () =>
    developerModeService.get(),
  );
  ipcMain.handle(
    SETTINGS_CHANNELS.setDeveloperMode,
    (event, enabled: unknown) => {
      const result = developerModeService.set(enabled);

      if (result.ok && result.enabled !== undefined) {
        applyDeveloperMode(event.sender, result.enabled);
      }

      return result;
    },
  );
};
