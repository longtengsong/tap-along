import type { IpcMain } from 'electron';
import { PROVIDER_CHANNELS } from '../../shared/providers.ts';
import type { ProviderConfigService } from '../services/providers.ts';

export const registerProviderHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  providerService: ProviderConfigService,
) => {
  ipcMain.handle(PROVIDER_CHANNELS.list, () => providerService.list());
  ipcMain.handle(PROVIDER_CHANNELS.get, (_event, id: unknown) =>
    providerService.get(id),
  );
  ipcMain.handle(PROVIDER_CHANNELS.save, (_event, payload: unknown) =>
    providerService.save(payload),
  );
  ipcMain.handle(PROVIDER_CHANNELS.clearKey, (_event, id: unknown) =>
    providerService.clearKey(id),
  );
  ipcMain.handle(PROVIDER_CHANNELS.setActive, (_event, id: unknown) =>
    providerService.setActive(id),
  );
};
