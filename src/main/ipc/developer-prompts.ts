import type { IpcMain } from 'electron';
import { DEVELOPER_PROMPTS_CHANNELS } from '../../shared/prompts.ts';
import type { DeveloperPromptConfigService } from '../services/developer-prompts.ts';

export const registerDeveloperPromptHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  promptService: DeveloperPromptConfigService,
) => {
  ipcMain.handle(DEVELOPER_PROMPTS_CHANNELS.get, () => promptService.get());
  ipcMain.handle(DEVELOPER_PROMPTS_CHANNELS.save, (_event, prompts: unknown) =>
    promptService.save(prompts),
  );
  ipcMain.handle(DEVELOPER_PROMPTS_CHANNELS.reset, () => promptService.reset());
};
