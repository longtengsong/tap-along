import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ImageStore } from '../src/main/services/image-store.ts';

const createStore = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-store-'));

  t.after(() => rm(directory, { recursive: true, force: true }));

  return { directory, store: new ImageStore(directory) };
};

test('图片文件应可写入、读取、统计并列出', async (t) => {
  const { directory, store } = await createStore(t);
  const bytes = new Uint8Array([1, 2, 3, 4]);

  const fileName = await store.write('img-1', bytes);

  assert.equal(fileName, 'img-1.webp');
  assert.deepEqual(
    new Uint8Array(await readFile(path.join(directory, 'img-1.webp'))),
    bytes,
  );
  assert.deepEqual(await store.read('img-1.webp'), bytes);

  const stats = await store.stat('img-1.webp');
  assert.equal(stats.size, 4);

  const listed = await store.listFileNames();
  assert.deepEqual(
    listed.map((item) => item.name),
    ['img-1.webp'],
  );
  assert.ok(listed[0].mtimeMs > 0);
  assert.deepEqual(
    (await readdir(directory)).filter((name) => name.endsWith('.tmp')),
    [],
  );

  const chunks = [];
  for await (const chunk of store.createReadStream('img-1.webp')) {
    chunks.push(chunk);
  }
  assert.deepEqual(new Uint8Array(Buffer.concat(chunks)), bytes);
});

test('缺失文件、删除和清空应安全处理', async (t) => {
  const { directory, store } = await createStore(t);

  assert.equal(await store.read('missing.webp'), null);
  assert.equal(await store.stat('missing.webp'), null);
  assert.deepEqual(await store.listFileNames(), []);
  await assert.doesNotReject(() => store.remove('missing.webp'));
  await assert.doesNotReject(() => store.clear());

  await store.write('img-1', new Uint8Array([1]));
  await store.remove('img-1.webp');
  assert.equal(await store.read('img-1.webp'), null);
  await assert.doesNotReject(() => store.remove('img-1.webp'));

  await store.write('img-2', new Uint8Array([2]));
  await store.clear();
  assert.deepEqual(await store.listFileNames(), []);
  assert.deepEqual(await readdir(directory).catch(() => []), []);
});

test('路径穿越和非法文件名应被拒绝', async (t) => {
  const { store } = await createStore(t);

  assert.throws(() => store.pathFor('../outside.webp'));
  assert.throws(() => store.pathFor('a/b.webp'));
  assert.throws(() => store.pathFor('/tmp/outside.webp'));
  assert.throws(() => store.pathFor(''));
  await assert.rejects(() => store.write('../evil', new Uint8Array([1])));
  await assert.rejects(() => store.read('../outside.webp'));
});

test('写入失败时不应留下临时文件', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-store-'));
  const blockingPath = path.join(directory, 'blocked');
  await writeFile(blockingPath, 'not a directory');

  t.after(() => rm(directory, { recursive: true, force: true }));

  const store = new ImageStore(blockingPath);

  await assert.rejects(() => store.write('img-1', new Uint8Array([1])));
  assert.deepEqual(await readdir(directory), ['blocked']);
});
