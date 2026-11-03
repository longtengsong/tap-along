import type { IpcMain } from 'electron';
import {
  TEACHER_CHANNELS,
  type TeacherChunkEvent,
  type TeacherDoneEvent,
} from '../../shared/pages.ts';
import type { TeacherService } from '../services/teacher.ts';
import type { TeacherRequestInspector } from '../services/teacher-request-inspector.ts';

export const registerTeacherHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  teacherService: TeacherService,
  requestInspector?: Pick<TeacherRequestInspector, 'get'>,
) => {
  ipcMain.handle(TEACHER_CHANNELS.ask, (event, payload: unknown) => {
    const outcome = teacherService.start(
      payload,
      (teacherEvent: TeacherChunkEvent | TeacherDoneEvent) => {
        const channel =
          'chunk' in teacherEvent
            ? TEACHER_CHANNELS.chunk
            : TEACHER_CHANNELS.done;
        event.sender.send(channel, teacherEvent);
      },
    );

    return outcome.result;
  });
  ipcMain.handle(TEACHER_CHANNELS.resume, (event, payload: unknown) => {
    const outcome = teacherService.startResume(
      payload,
      (teacherEvent: TeacherChunkEvent | TeacherDoneEvent) => {
        const channel =
          'chunk' in teacherEvent
            ? TEACHER_CHANNELS.chunk
            : TEACHER_CHANNELS.done;
        event.sender.send(channel, teacherEvent);
      },
    );

    return outcome.result;
  });
  ipcMain.handle(TEACHER_CHANNELS.maintenance, (event, payload: unknown) => {
    const outcome = teacherService.startMaintenance(
      payload,
      (teacherEvent: TeacherChunkEvent | TeacherDoneEvent) => {
        const channel =
          'chunk' in teacherEvent
            ? TEACHER_CHANNELS.chunk
            : TEACHER_CHANNELS.done;
        event.sender.send(channel, teacherEvent);
      },
    );

    return outcome.result;
  });
  ipcMain.handle(TEACHER_CHANNELS.cancel, (_event, payload: unknown) =>
    teacherService.cancel(payload),
  );
  ipcMain.handle(
    TEACHER_CHANNELS.inspectRequest,
    (_event, requestId: unknown) =>
      requestInspector
        ? requestInspector.get(requestId)
        : { ok: false, errorCode: 'DEVELOPER_MODE_REQUIRED' },
  );
};
