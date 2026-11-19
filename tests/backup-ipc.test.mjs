import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { BACKUP_CHANNELS } from '../src/shared/backup.ts';
import { registerBackupHandlers } from '../src/main/ipc/backup.ts';

const samplePage = {
  id: 1,
  title: '注意力',
  body: '注意力是有限资源。',
  doc: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '注意力是有限资源。' }],
      },
    ],
  },
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 0,
  messages: [],
};

const image = {
  id: 'img-1',
  fileName: 'img-1.webp',
  mime: 'image/webp',
  byteLength: 1234,
  createdAt: 1,
};

const otherImage = {
  id: 'img-2',
  fileName: 'img-2.webp',
  mime: 'image/webp',
  byteLength: 5678,
  createdAt: 2,
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
const baseFolder = path.join('/tmp/export', 'tap-along-backup-2026-11-04-1200');

const createDependencies = (overrides = {}) => {
  const mkdirs = [];
  const copies = [];
  const writes = [];

  const dependencies = {
    showOpenDialog: async () => ({
      canceled: false,
      filePaths: ['/tmp/export'],
    }),
    mkdir: async (target, options) => {
      mkdirs.push({ target, options });
    },
    copyFile: async (source, target) => {
      copies.push({ source, target });
    },
    writeFile: async (filePath, data, encoding) => {
      writes.push({ filePath, data, encoding });
    },
    stat: async () => {
      throw new Error('not found');
    },
    now: () => fixedDate,
    ...overrides,
  };

  return { dependencies, mkdirs, copies, writes };
};

test('导出取消时不应创建目录或写文件', async () => {
  const { handlers, ipcMain } = createIpcMain();
  const { dependencies, mkdirs, writes } = createDependencies({
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  });

  registerBackupHandlers(
    ipcMain,
    { listAll: () => [samplePage] },
    { listForPages: () => [image] },
    { pathFor: (fileName) => `/images/${fileName}` },
    dependencies,
  );

  assert.deepEqual(await handlers.get(BACKUP_CHANNELS.export)(), {
    ok: false,
    canceled: true,
  });
  assert.deepEqual(mkdirs, []);
  assert.deepEqual(writes, []);
});

test('导出应创建目录、复制引用图片并写 backup.json', async () => {
  const { handlers, ipcMain } = createIpcMain();
  const { dependencies, mkdirs, copies, writes } = createDependencies();
  let requestedPageIds;

  registerBackupHandlers(
    ipcMain,
    { listAll: () => [samplePage] },
    {
      listForPages(pageIds) {
        requestedPageIds = pageIds;
        return [image];
      },
    },
    { pathFor: (fileName) => `/images/${fileName}` },
    dependencies,
  );

  assert.deepEqual(await handlers.get(BACKUP_CHANNELS.export)(), {
    ok: true,
    pageCount: 1,
    imageCount: 1,
    missingImages: 0,
    folder: baseFolder,
  });
  assert.deepEqual(requestedPageIds, [1]);
  assert.deepEqual(mkdirs, [
    { target: path.join(baseFolder, 'images'), options: { recursive: true } },
  ]);
  assert.deepEqual(copies, [
    {
      source: '/images/img-1.webp',
      target: path.join(baseFolder, 'images', 'img-1.webp'),
    },
  ]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].filePath, path.join(baseFolder, 'backup.json'));

  const payload = JSON.parse(writes[0].data);
  assert.equal(payload.format, 'tap-along-backup');
  assert.equal(payload.version, 2);
  assert.equal(payload.pages[0].title, '注意力');
  assert.equal(payload.pages[0].doc.type, 'doc');
  assert.deepEqual(payload.images, [image]);
  assert.equal(writes[0].data.includes('base64'), false);
});

test('图片缺失时应跳过并继续导出', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { handlers, ipcMain } = createIpcMain();
  const { dependencies, writes } = createDependencies({
    copyFile: async (source) => {
      if (source.includes('img-1')) {
        throw new Error('文件缺失');
      }
    },
  });

  registerBackupHandlers(
    ipcMain,
    { listAll: () => [samplePage] },
    { listForPages: () => [image, otherImage] },
    { pathFor: (fileName) => `/images/${fileName}` },
    dependencies,
  );

  assert.deepEqual(await handlers.get(BACKUP_CHANNELS.export)(), {
    ok: true,
    pageCount: 1,
    imageCount: 1,
    missingImages: 1,
    folder: baseFolder,
  });

  const payload = JSON.parse(writes[0].data);
  assert.deepEqual(payload.images, [otherImage]);
});

test('子目录重名时应追加序号', async () => {
  const { handlers, ipcMain } = createIpcMain();
  const { dependencies } = createDependencies({
    stat: async (target) => {
      if (target === baseFolder) {
        return {};
      }

      throw new Error('not found');
    },
  });

  registerBackupHandlers(
    ipcMain,
    { listAll: () => [] },
    { listForPages: () => [] },
    { pathFor: (fileName) => `/images/${fileName}` },
    dependencies,
  );

  const result = await handlers.get(BACKUP_CHANNELS.export)();

  assert.equal(result.ok, true);
  assert.equal(result.folder, `${baseFolder}-1`);
});

test('写 backup.json 失败时应返回 EXPORT_FAILED', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { handlers, ipcMain } = createIpcMain();
  const { dependencies } = createDependencies({
    writeFile: async () => {
      throw new Error('磁盘已满');
    },
  });

  registerBackupHandlers(
    ipcMain,
    { listAll: () => [samplePage] },
    { listForPages: () => [] },
    { pathFor: (fileName) => `/images/${fileName}` },
    dependencies,
  );

  assert.deepEqual(await handlers.get(BACKUP_CHANNELS.export)(), {
    ok: false,
    errorCode: 'EXPORT_FAILED',
  });
});

test('目录选择异常时应返回 EXPORT_FAILED', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { handlers, ipcMain } = createIpcMain();
  const { dependencies } = createDependencies({
    showOpenDialog: async () => {
      throw new Error('对话框失败');
    },
  });

  registerBackupHandlers(
    ipcMain,
    { listAll: () => [] },
    { listForPages: () => [] },
    { pathFor: (fileName) => `/images/${fileName}` },
    dependencies,
  );

  assert.deepEqual(await handlers.get(BACKUP_CHANNELS.export)(), {
    ok: false,
    errorCode: 'EXPORT_FAILED',
  });
});
