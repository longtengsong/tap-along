import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  allocateDatabasePath,
  closeDatabase,
  openDatabase,
} from '../src/main/db/client.ts';
import { PageImagesRepository } from '../src/main/db/page-images.ts';
import { ImageStore } from '../src/main/services/image-store.ts';
import {
  createPageImage,
  registerImageHandlers,
  removePageImage,
} from '../src/main/ipc/images.ts';
import { IMAGE_CHANNELS } from '../src/shared/images.ts';

const makeWebp = (payloadLength = 16) => {
  const bytes = new Uint8Array(12 + payloadLength);

  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.fill(0x41, 12);

  return bytes;
};

const createFixture = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-images-ipc-'));
  const db = openDatabase(allocateDatabasePath(directory));
  const images = new PageImagesRepository(db);
  const store = new ImageStore(path.join(directory, 'images'));

  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });

  return { db, images, store };
};

test('合法 WebP 应写入文件与数据库', async (t) => {
  const { images, store } = await createFixture(t);
  const bytes = makeWebp(32);

  const result = await createPageImage(images, store, { bytes });

  assert.equal(result.ok, true);
  assert.equal(result.image.mime, 'image/webp');
  assert.equal(result.image.byteLength, bytes.byteLength);
  assert.match(result.image.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await store.read(`${result.image.id}.webp`), bytes);
  assert.equal(images.find(result.image.id).byte_length, bytes.byteLength);
});

test('非法结构与格式应返回 IMAGE_INVALID', async (t) => {
  const { images, store } = await createFixture(t);

  for (const payload of [
    null,
    {},
    { bytes: new Uint8Array() },
    { bytes: 'not-bytes' },
    { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    { bytes: new Uint8Array(12) },
    { bytes: makeWebp().map((value, index) => (index === 8 ? 0 : value)) },
  ]) {
    const result = await createPageImage(images, store, payload);
    assert.deepEqual(result, { ok: false, errorCode: 'IMAGE_INVALID' });
  }

  assert.deepEqual(await store.listFileNames(), []);
});

test('不按大小拒绝 WebP', async (t) => {
  const { images, store } = await createFixture(t);
  const bytes = makeWebp(1024 * 1024);

  const result = await createPageImage(images, store, { bytes });

  assert.equal(result.ok, true);
  assert.equal(result.image.byteLength, bytes.byteLength);
});

test('数据库写入失败时应回滚文件', async (t) => {
  const { store } = await createFixture(t);
  const repository = {
    create() {
      throw new Error('db failed');
    },
  };

  t.mock.method(console, 'error', () => {});

  const result = await createPageImage(repository, store, {
    bytes: makeWebp(),
  });

  assert.deepEqual(result, { ok: false, errorCode: 'IMAGE_SAVE_FAILED' });
  assert.deepEqual(await store.listFileNames(), []);
});

test('删除无引用图片应删文件与记录', async (t) => {
  const { images, store } = await createFixture(t);
  const created = await createPageImage(images, store, { bytes: makeWebp() });

  const result = await removePageImage(images, store, created.image.id);

  assert.deepEqual(result, { ok: true });
  assert.equal(images.find(created.image.id), null);
  assert.equal(await store.read(`${created.image.id}.webp`), null);
});

test('被引用的图片不应被删除', async (t) => {
  const { db, images, store } = await createFixture(t);
  const created = await createPageImage(images, store, { bytes: makeWebp() });
  const pageId = Number(
    db
      .prepare('INSERT INTO pages (body, source) VALUES (?, ?)')
      .run('一页', '课程').lastInsertRowid,
  );
  images.addRefs(pageId, [created.image.id]);

  const result = await removePageImage(images, store, created.image.id);

  assert.deepEqual(result, { ok: true });
  assert.notEqual(images.find(created.image.id), null);
  assert.notEqual(await store.read(`${created.image.id}.webp`), null);
});

test('非法 id 与不存在的 id 的删除行为', async (t) => {
  const { images, store } = await createFixture(t);

  assert.deepEqual(await removePageImage(images, store, ''), {
    ok: false,
    errorCode: 'IMAGE_INVALID',
  });
  assert.deepEqual(await removePageImage(images, store, 1), {
    ok: false,
    errorCode: 'IMAGE_INVALID',
  });
  assert.deepEqual(await removePageImage(images, store, 'missing'), {
    ok: true,
  });
});

test('文件删除失败不应让 remove 抛出', async (t) => {
  const { images, store } = await createFixture(t);
  const created = await createPageImage(images, store, { bytes: makeWebp() });
  const brokenStore = {
    remove() {
      throw new Error('file locked');
    },
  };

  t.mock.method(console, 'error', () => {});

  const result = await removePageImage(images, brokenStore, created.image.id);

  assert.deepEqual(result, { ok: true });
  assert.equal(images.find(created.image.id), null);
});

test('图片 IPC 注册应暴露创建与删除通道', async (t) => {
  const { images, store } = await createFixture(t);
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };

  registerImageHandlers(ipcMain, images, store);

  assert.equal(handlers.size, 2);
  assert.ok(handlers.has(IMAGE_CHANNELS.create));
  assert.ok(handlers.has(IMAGE_CHANNELS.remove));

  const created = await handlers.get(IMAGE_CHANNELS.create)(
    {},
    {
      bytes: makeWebp(),
    },
  );
  assert.equal(created.ok, true);

  const removed = await handlers.get(IMAGE_CHANNELS.remove)(
    {},
    created.image.id,
  );
  assert.deepEqual(removed, { ok: true });
});
