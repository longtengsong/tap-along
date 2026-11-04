import assert from 'node:assert/strict';
import test from 'node:test';
import { SEARCH_CHANNELS } from '../src/shared/search.ts';
import { registerSearchHandlers } from '../src/main/ipc/search.ts';

test('检索设置 IPC 应只暴露设置读取、保存、清除和测试', async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const calls = [];
  const configService = {
    async get() {
      calls.push('get');
      return { ok: true, settings: { enabled: true } };
    },
    async save(payload) {
      calls.push({ save: payload });
      return { ok: true, settings: { enabled: payload.enabled } };
    },
    async clearKey() {
      calls.push('clear');
      return { ok: true, settings: { enabled: true, configured: false } };
    },
  };
  const webSearch = {
    async test() {
      calls.push('test');
      return { ok: true };
    },
  };

  registerSearchHandlers(ipcMain, configService, webSearch);

  assert.deepEqual(
    new Set(handlers.keys()),
    new Set(Object.values(SEARCH_CHANNELS)),
  );
  assert.deepEqual(await handlers.get(SEARCH_CHANNELS.get)(null), {
    ok: true,
    settings: { enabled: true },
  });
  assert.deepEqual(
    await handlers.get(SEARCH_CHANNELS.save)(null, { enabled: false }),
    { ok: true, settings: { enabled: false } },
  );
  assert.deepEqual(await handlers.get(SEARCH_CHANNELS.clearKey)(null), {
    ok: true,
    settings: { enabled: true, configured: false },
  });
  assert.deepEqual(await handlers.get(SEARCH_CHANNELS.test)(null), {
    ok: true,
  });
  assert.deepEqual(calls, [
    'get',
    { save: { enabled: false } },
    'clear',
    'test',
  ]);
});
