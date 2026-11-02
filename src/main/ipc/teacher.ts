import type { IpcMain } from 'electron';
import {
  TEACHER_CHANNELS,
  type TeacherChunkEvent,
  type TeacherDoneEvent,
} from '../../shared/pages.ts';
import type { TeacherService } from '../services/teacher.ts';

export const registerTeacherHandlers = (
  ipcMain: Pick<IpcMain, 'handle'>,
  teacherService: TeacherService,
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
};
