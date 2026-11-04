import type { IpcMain } from 'electron';
import { SEARCH_CHANNELS } from '../../shared/search.ts';
import type { SearchConfigService } from '../services/search-config.ts';
import type { WebSearchService } from '../services/web-search.ts';

export const registerSearchHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  configService: Pick<SearchConfigService, 'get' | 'save' | 'clearKey'>,
  webSearch: Pick<WebSearchService, 'test'>,
) => {
  ipcMain.handle(SEARCH_CHANNELS.get, () => configService.get());
  ipcMain.handle(SEARCH_CHANNELS.save, (_event, payload: unknown) =>
    configService.save(payload),
  );
  ipcMain.handle(SEARCH_CHANNELS.clearKey, () => configService.clearKey());
  ipcMain.handle(SEARCH_CHANNELS.test, () => webSearch.test());
};
