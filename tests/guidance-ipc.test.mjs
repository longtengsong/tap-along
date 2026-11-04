import assert from 'node:assert/strict';
import test from 'node:test';
import { GUIDANCE_CHANNELS } from '../src/shared/guidance.ts';
import { PAGE_CHANNELS } from '../src/shared/pages.ts';
import { registerGuidanceHandlers } from '../src/main/ipc/guidance.ts';
import { registerPageHandlers } from '../src/main/ipc/pages.ts';

const samplePage = {
  id: 1,
  title: '注意力像带宽',
  body: '注意力像带宽。',
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 0,
  messages: [],
};

const createIpcMain = () => {
  const handlers = new Map();
  return {
    handlers,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
  };
};

test('引导 IPC 应只暴露使用接点通道并转发结果', () => {
  const { handlers, ipcMain } = createIpcMain();
  const calls = [];
  const service = {
    use(payload) {
      calls.push(payload);
      return { ok: true, question: '问题？' };
    },
    refresh(payload, emit) {
      calls.push({ refresh: payload });
      emit({ pageId: payload.pageId, guidance: { status: 'needed' } });
      return { ok: true };
    },
  };

  registerGuidanceHandlers(ipcMain, service);

  assert.deepEqual(
    new Set(handlers.keys()),
    new Set([GUIDANCE_CHANNELS.use, GUIDANCE_CHANNELS.run]),
  );
  assert.deepEqual(
    handlers.get(GUIDANCE_CHANNELS.use)(null, {
      pageId: 1,
      suggestionId: 'g-2',
    }),
    { ok: true, question: '问题？' },
  );
  assert.deepEqual(calls, [{ pageId: 1, suggestionId: 'g-2' }]);
});

test('引导刷新 IPC 应异步启动并把事件发回发送方', () => {
  const { handlers, ipcMain } = createIpcMain();
  const calls = [];
  const sent = [];
  const service = {
    use() {
      throw new Error('不应调用');
    },
    refresh(payload, emit) {
      calls.push(payload);
      emit({ pageId: payload.pageId, guidance: { status: 'needed' } });
      return { ok: true };
    },
  };
  const sender = {
    isDestroyed: () => false,
    send(channel, payload) {
      sent.push({ channel, payload });
    },
  };

  registerGuidanceHandlers(ipcMain, service);
  assert.deepEqual(
    handlers.get(GUIDANCE_CHANNELS.run)(
      { sender },
      {
        pageId: 1,
        mode: 'refresh',
      },
    ),
    { ok: true },
  );
  assert.deepEqual(calls, [{ pageId: 1, mode: 'refresh' }]);
  assert.deepEqual(sent, [
    {
      channel: GUIDANCE_CHANNELS.updated,
      payload: { pageId: 1, guidance: { status: 'needed' } },
    },
  ]);

  handlers.get(GUIDANCE_CHANNELS.run)(
    { sender },
    {
      pageId: 1,
      mode: 'retry',
    },
  );
  assert.deepEqual(calls.at(-1), { pageId: 1, mode: 'retry' });
});

test('保存页边后应触发引导并把终态事件发回发送方', async () => {
  const { handlers, ipcMain } = createIpcMain();
  const repository = {
    create(body, source) {
      return { ...samplePage, body, source };
    },
  };
  const runs = [];
  const sent = [];
  const guidance = {
    status: 'needed',
    suggestions: [],
    bodyHash: 'hash',
    updatedAt: 1,
  };
  const service = {
    run(pageId, emit) {
      runs.push({ pageId, emit });
      return Promise.resolve();
    },
  };
  const sender = {
    isDestroyed: () => false,
    send(channel, payload) {
      sent.push({ channel, payload });
    },
  };

  registerPageHandlers(ipcMain, repository, service);
  const result = handlers.get(PAGE_CHANNELS.save)(
    { sender },
    { body: '笔记', source: '课程' },
  );

  assert.equal(result.ok, true);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].pageId, 1);

  runs[0].emit({ pageId: 1, guidance });
  assert.deepEqual(sent, [
    { channel: GUIDANCE_CHANNELS.updated, payload: { pageId: 1, guidance } },
  ]);
});

test('保存失败或窗口已销毁时不应触发或发送引导', async () => {
  const { handlers, ipcMain } = createIpcMain();
  const repository = {
    create() {
      throw new Error('disk down');
    },
  };
  const runs = [];
  const service = {
    run(pageId, emit) {
      runs.push({ pageId, emit });
      return Promise.resolve();
    },
  };
  const sender = {
    isDestroyed: () => true,
    send() {
      throw new Error('不应发送');
    },
  };

  registerPageHandlers(ipcMain, repository, service);
  const failed = handlers.get(PAGE_CHANNELS.save)({ sender }, { body: '笔记' });

  assert.equal(failed.ok, false);
  assert.equal(runs.length, 0);

  repository.create = () => ({ ...samplePage });
  handlers.get(PAGE_CHANNELS.save)({ sender }, { body: '笔记' });
  assert.equal(runs.length, 1);
  runs[0].emit({ pageId: 1, guidance: {} });
});
