import { contextBridge, ipcRenderer } from 'electron';
import {
  PAGE_CHANNELS,
  TEACHER_CHANNELS,
  type AppendPagePayload,
  type ClosePagePayload,
  type EditPagePayload,
  type ListPagesPayload,
  type SavePagePayload,
  type TapAlongBridge,
  type TeacherAskPayload,
  type TeacherChunkEvent,
  type TeacherDoneEvent,
  type TeacherMaintenancePayload,
  type TeacherResumePayload,
} from './shared/pages.ts';

const tapAlongBridge: TapAlongBridge = {
  savePage: (payload: SavePagePayload) =>
    ipcRenderer.invoke(PAGE_CHANNELS.save, payload),
  getPage: (pageId: number) => ipcRenderer.invoke(PAGE_CHANNELS.get, pageId),
  listPages: (payload: ListPagesPayload) =>
    ipcRenderer.invoke(PAGE_CHANNELS.list, payload),
  appendPage: (payload: AppendPagePayload) =>
    ipcRenderer.invoke(PAGE_CHANNELS.append, payload),
  editPage: (payload: EditPagePayload) =>
    ipcRenderer.invoke(PAGE_CHANNELS.edit, payload),
  closePage: (payload: ClosePagePayload) =>
    ipcRenderer.invoke(PAGE_CHANNELS.close, payload),
  askTeacher: (payload: TeacherAskPayload) =>
    ipcRenderer.invoke(TEACHER_CHANNELS.ask, payload),
  resumeTeacher: (payload: TeacherResumePayload) =>
    ipcRenderer.invoke(TEACHER_CHANNELS.resume, payload),
  maintainTeacher: (payload: TeacherMaintenancePayload) =>
    ipcRenderer.invoke(TEACHER_CHANNELS.maintenance, payload),
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
