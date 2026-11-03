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
  type TeacherCancelPayload,
  type TeacherChunkEvent,
  type TeacherDoneEvent,
  type TeacherMaintenancePayload,
  type TeacherRequestInspectionResult,
  type TeacherResumePayload,
} from './shared/pages.ts';
import {
  PROVIDER_CHANNELS,
  type ModelProviderId,
  type SaveModelProviderPayload,
} from './shared/providers.ts';
import { DEVELOPER_PROMPTS_CHANNELS } from './shared/prompts.ts';
import { SETTINGS_CHANNELS } from './shared/settings.ts';

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
  clearAllPages: () => ipcRenderer.invoke(PAGE_CHANNELS.clearAll),
  askTeacher: (payload: TeacherAskPayload) =>
    ipcRenderer.invoke(TEACHER_CHANNELS.ask, payload),
  resumeTeacher: (payload: TeacherResumePayload) =>
    ipcRenderer.invoke(TEACHER_CHANNELS.resume, payload),
  maintainTeacher: (payload: TeacherMaintenancePayload) =>
    ipcRenderer.invoke(TEACHER_CHANNELS.maintenance, payload),
  cancelTeacher: (payload: TeacherCancelPayload) =>
    ipcRenderer.invoke(TEACHER_CHANNELS.cancel, payload),
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
  inspectTeacherRequest: (
    requestId: string,
  ): Promise<TeacherRequestInspectionResult> =>
    ipcRenderer.invoke(TEACHER_CHANNELS.inspectRequest, requestId),
  listProviders: () => ipcRenderer.invoke(PROVIDER_CHANNELS.list),
  getProvider: (id: ModelProviderId) =>
    ipcRenderer.invoke(PROVIDER_CHANNELS.get, id),
  saveProvider: (payload: SaveModelProviderPayload) =>
    ipcRenderer.invoke(PROVIDER_CHANNELS.save, payload),
  clearProviderKey: (id: ModelProviderId) =>
    ipcRenderer.invoke(PROVIDER_CHANNELS.clearKey, id),
  setActiveProvider: (id: ModelProviderId) =>
    ipcRenderer.invoke(PROVIDER_CHANNELS.setActive, id),
  testProvider: (id: ModelProviderId) =>
    ipcRenderer.invoke(PROVIDER_CHANNELS.test, id),
  getDeveloperMode: () =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.getDeveloperMode),
  setDeveloperMode: (enabled: boolean) =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.setDeveloperMode, enabled),
  getDeveloperPrompts: () => ipcRenderer.invoke(DEVELOPER_PROMPTS_CHANNELS.get),
  saveDeveloperPrompts: (prompts) =>
    ipcRenderer.invoke(DEVELOPER_PROMPTS_CHANNELS.save, prompts),
  resetDeveloperPrompts: () =>
    ipcRenderer.invoke(DEVELOPER_PROMPTS_CHANNELS.reset),
};

contextBridge.exposeInMainWorld('tapAlong', tapAlongBridge);
