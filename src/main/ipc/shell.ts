import type { IpcMain } from 'electron';
import type { OpenExternalResult } from '../../shared/shell.ts';
import { SHELL_CHANNELS, isSafeExternalUrl } from '../../shared/shell.ts';

type OpenExternal = (url: string) => Promise<void>;

export const registerShellHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  openExternal: OpenExternal,
) => {
  ipcMain.handle(
    SHELL_CHANNELS.openExternal,
    async (_event, url: unknown): Promise<OpenExternalResult> => {
      if (!isSafeExternalUrl(url)) {
        return { ok: false, errorCode: 'EXTERNAL_URL_INVALID' };
      }

      try {
        await openExternal(url);
        return { ok: true };
      } catch {
        return { ok: false, errorCode: 'EXTERNAL_URL_INVALID' };
      }
    },
  );
};
