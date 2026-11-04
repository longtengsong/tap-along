import type { IpcMain } from 'electron';
import { GUIDANCE_CHANNELS } from '../../shared/guidance.ts';
import type { GuidanceService } from '../services/guidance.ts';

export const registerGuidanceHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  guidanceService: Pick<GuidanceService, 'use' | 'refresh'>,
) => {
  ipcMain.handle(GUIDANCE_CHANNELS.use, (_event, payload: unknown) =>
    guidanceService.use(payload),
  );
  ipcMain.handle(GUIDANCE_CHANNELS.run, (event, payload: unknown) => {
    const sender = event?.sender;

    return guidanceService.refresh(payload, (update) => {
      if (sender && !sender.isDestroyed()) {
        sender.send(GUIDANCE_CHANNELS.updated, update);
      }
    });
  });
};
