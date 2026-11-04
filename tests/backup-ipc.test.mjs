import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { BACKUP_CHANNELS } from '../src/shared/backup.ts';
import { registerBackupHandlers } from '../src/main/ipc/backup.ts';

const samplePage = {
  id: 1,
  title: '注意力',
  body: '注意力是有限资源。',
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

const fixedDate = new Date(2026, 10, 4, 12, 0, 0);

test('导出取消时不应写文件', async () => {
  const { handlers, ipcMain } = createIpcMain();
  const writes = [];

  registerBackupHandlers(
    ipcMain,
    { listAll: () => [samplePage] },
    {
      documentsPath: '/tmp/docs',
      showSaveDialog: async () => ({ canceled: true }),
      writeFile: async (...args) => {
        writes.push(args);
      },
      now: () => fixedDate,
    },
  );

  assert.deepEqual(await handlers.get(BACKUP_CHANNELS.export)(), {
    ok: false,
    canceled: true,
  });
  assert.deepEqual(writes, []);
});

test('导出应写入全部页面并返回数量', async () => {
  const { handlers, ipcMain } = createIpcMain();
  let dialogOptions;
  let writtenPath;
  let writtenData;

  registerBackupHandlers(
    ipcMain,
    { listAll: () => [samplePage] },
    {
      documentsPath: '/tmp/docs',
      showSaveDialog: async (options) => {
        dialogOptions = options;
        return { canceled: false, filePath: '/tmp/backup.json' };
      },
      writeFile: async (filePath, data) => {
        writtenPath = filePath;
        writtenData = data;
      },
      now: () => fixedDate,
    },
  );

  assert.deepEqual(await handlers.get(BACKUP_CHANNELS.export)(), {
    ok: true,
    pageCount: 1,
  });
  assert.equal(
    dialogOptions.defaultPath,
    path.join('/tmp/docs', 'tap-along-backup-2026-11-04.json'),
  );
  assert.deepEqual(dialogOptions.filters, [
    { name: 'JSON', extensions: ['json'] },
  ]);
  assert.equal(writtenPath, '/tmp/backup.json');
  assert.equal(writtenData.endsWith('\n'), true);

  const payload = JSON.parse(writtenData);
  assert.equal(payload.format, 'tap-along-backup');
  assert.equal(payload.version, 1);
  assert.equal(payload.pages.length, 1);
  assert.equal(payload.pages[0].title, '注意力');
});

test('导出写入失败时应返回统一错误码', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { handlers, ipcMain } = createIpcMain();

  registerBackupHandlers(
    ipcMain,
    { listAll: () => [samplePage] },
    {
      documentsPath: '/tmp/docs',
      showSaveDialog: async () => ({
        canceled: false,
        filePath: '/tmp/backup.json',
      }),
      writeFile: async () => {
        throw new Error('磁盘已满');
      },
      now: () => fixedDate,
    },
  );

  assert.deepEqual(await handlers.get(BACKUP_CHANNELS.export)(), {
    ok: false,
    errorCode: 'EXPORT_FAILED',
  });
});

test('保存对话框异常时应返回统一错误码', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { handlers, ipcMain } = createIpcMain();

  registerBackupHandlers(
    ipcMain,
    { listAll: () => [] },
    {
      documentsPath: '/tmp/docs',
      showSaveDialog: async () => {
        throw new Error('对话框失败');
      },
      writeFile: async () => {},
      now: () => fixedDate,
    },
  );

  assert.deepEqual(await handlers.get(BACKUP_CHANNELS.export)(), {
    ok: false,
    errorCode: 'EXPORT_FAILED',
  });
});
