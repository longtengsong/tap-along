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
    startResume(payload, emit) {
      emit({
        pageId: payload.targetPageId,
        requestId: payload.requestId,
        chunk: '跨页',
      });
      emit({
        ok: true,
        pageId: payload.targetPageId,
        requestId: payload.requestId,
        reply: '跨页问题',
        suggestClose: false,
      });
      return { result: { ok: true, requestId: payload.requestId } };
    },
    startMaintenance(payload, emit) {
      emit({
        pageId: payload.pageId,
        requestId: payload.requestId,
        chunk: '维护',
      });
      emit({
        ok: true,
        pageId: payload.pageId,
        requestId: payload.requestId,
        reply: '维护回应',
        suggestClose: false,
      });
      return { result: { ok: true, requestId: payload.requestId } };
    },
    cancel(payload) {
      return { ok: true, requestId: payload.requestId };
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

  assert.deepEqual(
    new Set(handlers.keys()),
    new Set([
      TEACHER_CHANNELS.ask,
      TEACHER_CHANNELS.resume,
      TEACHER_CHANNELS.maintenance,
      TEACHER_CHANNELS.cancel,
    ]),
  );
  assert.deepEqual(
    handlers.get(TEACHER_CHANNELS.ask)(event, {
      pageId: 1,
      userText: '我的想法',
      requestId: 'request-1',
    }),
    { ok: true, requestId: 'request-1' },
  );
  assert.deepEqual(
    handlers.get(TEACHER_CHANNELS.resume)(event, {
      targetPageId: 2,
      contextPageId: 1,
      requestId: 'resume-1',
    }),
    { ok: true, requestId: 'resume-1' },
  );
  assert.deepEqual(
    handlers.get(TEACHER_CHANNELS.maintenance)(event, {
      pageId: 1,
      kind: 'append',
      triggerText: '补入的想法',
      requestId: 'maintenance-1',
    }),
    { ok: true, requestId: 'maintenance-1' },
  );
  assert.deepEqual(
    handlers.get(TEACHER_CHANNELS.cancel)(event, {
      requestId: 'maintenance-1',
    }),
    { ok: true, requestId: 'maintenance-1' },
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
    {
      channel: TEACHER_CHANNELS.chunk,
      payload: {
        pageId: 2,
        requestId: 'resume-1',
        chunk: '跨页',
      },
    },
    {
      channel: TEACHER_CHANNELS.done,
      payload: {
        ok: true,
        pageId: 2,
        requestId: 'resume-1',
        reply: '跨页问题',
        suggestClose: false,
      },
    },
    {
      channel: TEACHER_CHANNELS.chunk,
      payload: {
        pageId: 1,
        requestId: 'maintenance-1',
        chunk: '维护',
      },
    },
    {
      channel: TEACHER_CHANNELS.done,
      payload: {
        ok: true,
        pageId: 1,
        requestId: 'maintenance-1',
        reply: '维护回应',
        suggestClose: false,
      },
    },
  ]);
});
