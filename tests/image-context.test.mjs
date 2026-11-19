import assert from 'node:assert/strict';
import test from 'node:test';
import { ImageContextService } from '../src/main/services/image-context.ts';

test('图片上下文应读取文件并转成 data URL', async () => {
  const service = new ImageContextService(
    {
      find: (imageId) =>
        imageId === 'image-1'
          ? {
              id: 'image-1',
              file_name: 'image-1.webp',
              mime: 'image/webp',
              byte_length: 3,
              created_at: 1,
            }
          : null,
    },
    {
      read: async (fileName) =>
        fileName === 'image-1.webp' ? new Uint8Array([1, 2, 3]) : null,
    },
  );

  assert.deepEqual(await service.resolve('image-1'), {
    mime: 'image/webp',
    dataUrl: 'data:image/webp;base64,AQID',
  });
});

test('缺失行、缺失文件和读取异常应返回 null', async () => {
  const service = new ImageContextService(
    {
      find: (imageId) =>
        imageId === 'image-1'
          ? {
              id: 'image-1',
              file_name: 'image-1.webp',
              mime: 'image/webp',
              byte_length: 3,
              created_at: 1,
            }
          : null,
    },
    {
      read: async () => {
        throw new Error('磁盘错误');
      },
    },
  );

  assert.equal(await service.resolve('missing'), null);
  assert.equal(await service.resolve('image-1'), null);

  const missingFile = new ImageContextService(
    {
      find: () => ({
        id: 'image-1',
        file_name: 'image-1.webp',
        mime: 'image/webp',
        byte_length: 3,
        created_at: 1,
      }),
    },
    { read: async () => null },
  );

  assert.equal(await missingFile.resolve('image-1'), null);
});
