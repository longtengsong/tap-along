import assert from 'node:assert/strict';
import test from 'node:test';
import { TEACHER_CHANNELS } from '../src/shared/pages.ts';
import { registerTeacherHandlers } from '../src/main/ipc/teacher.ts';

test('老师 IPC 应启动请求并转发 chunk 与 done 事件', () => {
  const handlers = new Map();
  const sent = [];
  const service = {
    start(payload, emit) {
      emit({
        pageId: payload.pageId,
        requestId: payload.requestId,
        chunk: '一半',
      });
      emit({
        ok: true,
        pageId: payload.pageId,
        requestId: payload.requestId,
        reply: '一半回应',
        suggestClose: false,
      });
      return { result: { ok: true, requestId: payload.requestId } };
    },
  };
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const event = {
    sender: {
      send(channel, payload) {
        sent.push({ channel, payload });
      },
    },
  };

  registerTeacherHandlers(ipcMain, service);

  assert.deepEqual(new Set(handlers.keys()), new Set([TEACHER_CHANNELS.ask]));
  assert.deepEqual(
    handlers.get(TEACHER_CHANNELS.ask)(event, {
      pageId: 1,
      userText: '我的想法',
      requestId: 'request-1',
    }),
    { ok: true, requestId: 'request-1' },
  );
  assert.deepEqual(sent, [
    {
      channel: TEACHER_CHANNELS.chunk,
      payload: {
        pageId: 1,
        requestId: 'request-1',
        chunk: '一半',
      },
    },
    {
      channel: TEACHER_CHANNELS.done,
      payload: {
        ok: true,
        pageId: 1,
        requestId: 'request-1',
        reply: '一半回应',
        suggestClose: false,
      },
    },
  ]);
});
