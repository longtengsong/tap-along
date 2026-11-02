import { contextBridge, ipcRenderer } from 'electron';
import {
  PAGE_CHANNELS,
  TEACHER_CHANNELS,
  type ListPagesPayload,
  type SavePagePayload,
  type TapAlongBridge,
  type TeacherAskPayload,
  type TeacherChunkEvent,
  type TeacherDoneEvent,
} from './shared/pages.ts';

const tapAlongBridge: TapAlongBridge = {
  savePage: (payload: SavePagePayload) =>
    ipcRenderer.invoke(PAGE_CHANNELS.save, payload),
  getPage: (pageId: number) => ipcRenderer.invoke(PAGE_CHANNELS.get, pageId),
  listPages: (payload: ListPagesPayload) =>
    ipcRenderer.invoke(PAGE_CHANNELS.list, payload),
  askTeacher: (payload: TeacherAskPayload) =>
    ipcRenderer.invoke(TEACHER_CHANNELS.ask, payload),
  onTeacherChunk: (callback: (event: TeacherChunkEvent) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: TeacherChunkEvent,
    ) => callback(data);
    ipcRenderer.on(TEACHER_CHANNELS.chunk, listener);
    return () => ipcRenderer.removeListener(TEACHER_CHANNELS.chunk, listener);
  },
  onTeacherDone: (callback: (event: TeacherDoneEvent) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: TeacherDoneEvent,
    ) => callback(data);
    ipcRenderer.on(TEACHER_CHANNELS.done, listener);
    return () => ipcRenderer.removeListener(TEACHER_CHANNELS.done, listener);
  },
};

contextBridge.exposeInMainWorld('tapAlong', tapAlongBridge);
