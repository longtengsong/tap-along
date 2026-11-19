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
import {
  PageImageReferenceError,
  PageImagesRepository,
} from '../src/main/db/page-images.ts';

const createRepository = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-images-'));
  const db = openDatabase(allocateDatabasePath(directory));

  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });

  return { db, images: new PageImagesRepository(db) };
};

const createPage = (db, body = '一页念头') =>
  Number(
    db
      .prepare('INSERT INTO pages (body, source) VALUES (?, ?)')
      .run(body, '课程').lastInsertRowid,
  );

const createImage = (images, id, createdAt = 1, byteLength = 100) =>
  images.create({
    id,
    fileName: `${id}.webp`,
    mime: 'image/webp',
    byteLength,
    createdAt,
  });

test('图片元数据应可创建并读取', async (t) => {
  const { images } = await createRepository(t);
  const meta = createImage(images, 'img-1', 123, 456);
  const row = images.find('img-1');

  assert.deepEqual(meta, {
    id: 'img-1',
    mime: 'image/webp',
    byteLength: 456,
  });
  assert.equal(row.id, 'img-1');
  assert.equal(row.file_name, 'img-1.webp');
  assert.equal(row.mime, 'image/webp');
  assert.equal(row.byte_length, 456);
  assert.equal(row.created_at, 123);
  assert.equal(images.find('missing'), null);
  assert.equal(images.find('   '), null);
});

test('引用应可新增、共享并整体替换', async (t) => {
  const { db, images } = await createRepository(t);
  const pageA = createPage(db, 'A');
  const pageB = createPage(db, 'B');
  createImage(images, 'img-1');
  createImage(images, 'img-2');

  images.addRefs(pageA, ['img-1', 'img-1']);
  images.addRefs(pageB, ['img-1']);

  assert.equal(
    db
      .prepare(
        'SELECT COUNT(*) AS count FROM page_image_refs WHERE page_id = ?',
      )
      .get(pageA).count,
    1,
  );
  assert.deepEqual(
    images.listForPages([pageA]).map((image) => image.id),
    ['img-1'],
  );

  const removed = images.replaceRefs(pageA, ['img-2', 'img-1']);

  assert.deepEqual(removed, []);
  assert.deepEqual(
    images
      .listForPages([pageA])
      .map((image) => image.id)
      .sort(),
    ['img-1', 'img-2'],
  );
  assert.deepEqual(
    images.listForPages([pageB]).map((image) => image.id),
    ['img-1'],
  );
});

test('移除唯一引用后应删除图片行并返回文件名', async (t) => {
  const { db, images } = await createRepository(t);
  const pageA = createPage(db, 'A');
  const pageB = createPage(db, 'B');
  createImage(images, 'img-1');
  images.addRefs(pageA, ['img-1']);
  images.addRefs(pageB, ['img-1']);

  assert.deepEqual(images.replaceRefs(pageA, []), []);
  assert.notEqual(images.find('img-1'), null);

  assert.deepEqual(images.replaceRefs(pageB, []), ['img-1.webp']);
  assert.equal(images.find('img-1'), null);
  assert.deepEqual(images.listForPages([pageA, pageB]), []);
});

test('引用不存在的图片时应抛错且不改旧引用', async (t) => {
  const { db, images } = await createRepository(t);
  const page = createPage(db);
  createImage(images, 'img-1');
  images.addRefs(page, ['img-1']);

  assert.throws(
    () => images.addRefs(page, ['missing']),
    (error) =>
      error instanceof PageImageReferenceError && error.reason === 'not_found',
  );
  assert.throws(
    () => images.replaceRefs(page, ['missing']),
    (error) =>
      error instanceof PageImageReferenceError && error.reason === 'not_found',
  );

  assert.deepEqual(
    images.listForPages([page]).map((image) => image.id),
    ['img-1'],
  );
});

test('只有无引用图片可删除', async (t) => {
  const { db, images } = await createRepository(t);
  const page = createPage(db);
  createImage(images, 'img-1');
  createImage(images, 'img-2');
  images.addRefs(page, ['img-1']);

  assert.equal(images.removeIfUnreferenced('img-1'), null);
  assert.equal(images.removeIfUnreferenced('img-2'), 'img-2.webp');
  assert.equal(images.find('img-2'), null);
  assert.equal(images.removeIfUnreferenced('missing'), null);
});

test('清理只应删除超期且无引用的图片', async (t) => {
  const { db, images } = await createRepository(t);
  const page = createPage(db);
  createImage(images, 'old-unused', 10);
  createImage(images, 'new-unused', 100);
  createImage(images, 'old-used', 10);
  images.addRefs(page, ['old-used']);

  assert.deepEqual(images.pruneUnreferenced(50), ['old-unused.webp']);
  assert.equal(images.find('old-unused'), null);
  assert.notEqual(images.find('new-unused'), null);
  assert.notEqual(images.find('old-used'), null);
});

test('按页面列图片应去重并返回文件元数据', async (t) => {
  const { db, images } = await createRepository(t);
  const pageA = createPage(db, 'A');
  const pageB = createPage(db, 'B');
  createImage(images, 'img-1', 1);
  createImage(images, 'img-2', 2);
  createImage(images, 'img-3', 3);
  images.addRefs(pageA, ['img-1', 'img-2']);
  images.addRefs(pageB, ['img-2', 'img-3']);

  const result = images.listForPages([pageA, pageB, pageA, 0, -1]);

  assert.deepEqual(
    result.map((image) => image.id),
    ['img-1', 'img-2', 'img-3'],
  );
  assert.deepEqual(result[0], {
    id: 'img-1',
    mime: 'image/webp',
    byteLength: 100,
    fileName: 'img-1.webp',
    createdAt: 1,
  });
  assert.deepEqual(images.listForPages([]), []);
});

test('列出文件名并清空全部图片', async (t) => {
  const { db, images } = await createRepository(t);
  const page = createPage(db);
  createImage(images, 'img-1');
  createImage(images, 'img-2');
  images.addRefs(page, ['img-1']);

  assert.deepEqual(images.listAllFileNames().sort(), [
    'img-1.webp',
    'img-2.webp',
  ]);

  images.clearAll();

  assert.deepEqual(images.listAllFileNames(), []);
  assert.deepEqual(images.listForPages([page]), []);
  assert.deepEqual(
    db.prepare('SELECT COUNT(*) AS count FROM page_image_refs').get().count,
    0,
  );
});
