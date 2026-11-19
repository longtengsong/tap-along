import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
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
  ImageCleanupService,
  ORPHAN_FILE_RETENTION_MS,
  TEMP_FILE_RETENTION_MS,
  UNREFERENCED_IMAGE_RETENTION_MS,
} from '../src/main/services/image-cleanup.ts';

const DAY = 24 * 60 * 60 * 1000;
const now = 1_800_000_000_000;
const old = now - 31 * DAY;
const recent = now - 10 * DAY;
const orphanRecent = now - 2 * DAY;
const tempRecent = now - 60 * 60 * 1000;

const createFixture = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-cleanup-'));
  const db = openDatabase(allocateDatabasePath(directory));
  const images = new PageImagesRepository(db);
  const store = new ImageStore(path.join(directory, 'images'));
  const pageId = Number(
    db
      .prepare('INSERT INTO pages (body, source) VALUES (?, ?)')
      .run('清理测试', '课程').lastInsertRowid,
  );

  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });

  return { db, images, store, pageId, directory };
};

const addImage = async (images, store, id, createdAt) => {
  const fileName = await store.write(id, new Uint8Array([1, 2, 3]));
  images.create({
    id,
    fileName,
    mime: 'image/webp',
    byteLength: 3,
    createdAt,
  });
  return fileName;
};

test('清理应删除超期无引用图片、旧孤儿和旧临时文件', async (t) => {
  const { images, store, pageId, directory } = await createFixture(t);

  const referencedFile = await addImage(images, store, 'ref-old', old);
  images.addRefs(pageId, ['ref-old']);

  const oldUnreferencedFile = await addImage(
    images,
    store,
    'old-unreferenced',
    old,
  );
  const recentUnreferencedFile = await addImage(
    images,
    store,
    'recent-unreferenced',
    recent,
  );
  images.create({
    id: 'missing-referenced',
    fileName: 'missing-referenced.webp',
    mime: 'image/webp',
    byteLength: 3,
    createdAt: old,
  });
  images.addRefs(pageId, ['missing-referenced']);

  const orphanOldFile = await store.write('orphan-old', new Uint8Array([4]));
  const orphanRecentFile = await store.write(
    'orphan-recent',
    new Uint8Array([5]),
  );
  await utimes(store.pathFor(orphanOldFile), new Date(old), new Date(old));
  await utimes(
    store.pathFor(orphanRecentFile),
    new Date(orphanRecent),
    new Date(orphanRecent),
  );

  const imagesDirectory = path.join(directory, 'images');
  await mkdir(imagesDirectory, { recursive: true });
  await writeFile(path.join(imagesDirectory, '.tmp-old'), 'tmp');
  await writeFile(path.join(imagesDirectory, 'old.tmp'), 'tmp');
  await writeFile(path.join(imagesDirectory, '.tmp-new'), 'tmp');
  await utimes(
    path.join(imagesDirectory, '.tmp-old'),
    new Date(old),
    new Date(old),
  );
  await utimes(
    path.join(imagesDirectory, 'old.tmp'),
    new Date(old),
    new Date(old),
  );
  await utimes(
    path.join(imagesDirectory, '.tmp-new'),
    new Date(tempRecent),
    new Date(tempRecent),
  );

  const result = await new ImageCleanupService(images, store, () => now).run();

  assert.equal(result.removedRows, 1);
  assert.equal(result.removedFiles, 4);
  assert.equal(images.find('old-unreferenced'), null);
  assert.equal(await store.read(oldUnreferencedFile), null);
  assert.notEqual(images.find('ref-old'), null);
  assert.notEqual(await store.read(referencedFile), null);
  assert.notEqual(images.find('recent-unreferenced'), null);
  assert.notEqual(await store.read(recentUnreferencedFile), null);
  assert.notEqual(images.find('missing-referenced'), null);
  assert.equal(await store.read(orphanOldFile), null);
  assert.notEqual(await store.read(orphanRecentFile), null);
  assert.equal(await store.read('.tmp-old'), null);
  assert.equal(await store.read('old.tmp'), null);
  assert.notEqual(await store.read('.tmp-new'), null);
});

test('文件删除失败时只记录日志并继续', async (t) => {
  t.mock.method(console, 'error', () => {});
  const images = {
    pruneUnreferenced: () => ['broken.webp'],
    listAllFileNames: () => [],
  };
  const store = {
    listFileNames: async () => [],
    remove: async () => {
      throw new Error('文件被占用');
    },
  };

  const result = await new ImageCleanupService(images, store, () => now).run();

  assert.deepEqual(result, { removedRows: 1, removedFiles: 0 });
});

test('保留期常量应为 30/7/1 天', () => {
  assert.equal(UNREFERENCED_IMAGE_RETENTION_MS, 30 * DAY);
  assert.equal(ORPHAN_FILE_RETENTION_MS, 7 * DAY);
  assert.equal(TEMP_FILE_RETENTION_MS, DAY);
});
