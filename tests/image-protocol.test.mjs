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
  createTapImageResponse,
  registerTapImageHandler,
  registerTapImageScheme,
} from '../src/main/services/tap-image-protocol.ts';

const IMAGE_ID = '00000000-0000-4000-8000-000000000001';
const IMAGE_URL = `tap-image://img/${IMAGE_ID}`;

const createFixture = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-protocol-'));
  const db = openDatabase(allocateDatabasePath(directory));
  const images = new PageImagesRepository(db);
  const store = new ImageStore(path.join(directory, 'images'));

  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });

  return { db, images, store };
};

test('合法图片应返回 WebP、长度和长缓存头', async (t) => {
  const { images, store } = await createFixture(t);
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const fileName = await store.write(IMAGE_ID, bytes);
  images.create({
    id: IMAGE_ID,
    fileName,
    mime: 'image/webp',
    byteLength: bytes.byteLength,
    createdAt: 1,
  });

  const response = await createTapImageResponse(IMAGE_URL, images, store);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('content-length'), '5');
  assert.equal(
    response.headers.get('cache-control'),
    'private, max-age=31536000, immutable',
  );
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('非法 URL、未知图片和缺失文件应返回 404', async (t) => {
  const { images, store } = await createFixture(t);

  for (const url of [
    'not-a-url',
    'tap-image://other/' + IMAGE_ID,
    'tap-image://img/not-a-uuid',
    `tap-image://img/${IMAGE_ID}/extra`,
    'tap-image://img/',
  ]) {
    const response = await createTapImageResponse(url, images, store);
    assert.equal(response.status, 404, url);
  }

  const missingRow = await createTapImageResponse(IMAGE_URL, images, store);
  assert.equal(missingRow.status, 404);

  images.create({
    id: IMAGE_ID,
    fileName: 'missing.webp',
    mime: 'image/webp',
    byteLength: 4,
    createdAt: 1,
  });

  const missingFile = await createTapImageResponse(IMAGE_URL, images, store);
  assert.equal(missingFile.status, 404);
});

test('协议注册应使用 tap-image scheme 与 handler', async (t) => {
  const { images, store } = await createFixture(t);
  let registeredSchemes;
  const handlers = new Map();
  const protocol = {
    registerSchemesAsPrivileged(schemes) {
      registeredSchemes = schemes;
    },
    handle(scheme, handler) {
      handlers.set(scheme, handler);
    },
  };

  registerTapImageScheme(protocol);
  registerTapImageHandler(protocol, images, store);

  assert.equal(registeredSchemes[0].scheme, 'tap-image');
  assert.equal(registeredSchemes[0].privileges.standard, true);
  assert.equal(registeredSchemes[0].privileges.secure, true);

  const response = await handlers.get('tap-image')({
    url: `tap-image://img/${IMAGE_ID}`,
  });
  assert.equal(response.status, 404);
});
