import { contextBridge, ipcRenderer } from 'electron';
import {
  PAGE_CHANNELS,
  type SavePagePayload,
  type TapAlongBridge,
} from './shared/pages.ts';

const tapAlongBridge: TapAlongBridge = {
  savePage: (payload: SavePagePayload) =>
    ipcRenderer.invoke(PAGE_CHANNELS.save, payload),
  getPage: (pageId: number) => ipcRenderer.invoke(PAGE_CHANNELS.get, pageId),
};

contextBridge.exposeInMainWorld('tapAlong', tapAlongBridge);
