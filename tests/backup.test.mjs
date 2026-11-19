import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackupPayload,
} from '../src/shared/backup.ts';

const page = {
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
  status: 'closed',
  parseStatus: 'pending',
  teachingRoundCount: 1,
  messages: [],
  guidance: {
    status: 'needed',
    suggestions: [
      {
        id: 'g-1',
        relatedPageId: 2,
        title: '旧念头',
        source: '课程',
        why: '都在讨论注意力。',
        question: '限制在哪里？',
        anchorQuote: '注意力是有限资源',
      },
    ],
    bodyHash: 'hash',
    updatedAt: 1,
  },
};

const image = {
  id: 'img-1',
  fileName: 'img-1.webp',
  mime: 'image/webp',
  byteLength: 1234,
  createdAt: 1,
};

test('备份应带格式、版本、时间、页面和图片元数据', () => {
  const payload = buildBackupPayload(
    [page],
    [image],
    '2026-11-04T12:00:00.000Z',
  );

  assert.equal(payload.format, BACKUP_FORMAT);
  assert.equal(payload.version, BACKUP_VERSION);
  assert.equal(payload.version, 2);
  assert.equal(payload.exportedAt, '2026-11-04T12:00:00.000Z');
  assert.deepEqual(payload.pages, [page]);
  assert.deepEqual(payload.images, [image]);
  assert.equal(
    payload.pages[0].guidance.suggestions[0].anchorQuote,
    '注意力是有限资源',
  );
});

test('备份应允许空页面和空图片数组', () => {
  assert.deepEqual(buildBackupPayload([], [], '2026-11-04T12:00:00.000Z'), {
    format: 'tap-along-backup',
    version: 2,
    exportedAt: '2026-11-04T12:00:00.000Z',
    pages: [],
    images: [],
  });
});

test('备份 JSON 不应包含 base64 图片数据', () => {
  const payload = buildBackupPayload([page], [image]);
  const serialized = JSON.stringify(payload);

  assert.equal(serialized.includes('data:image'), false);
  assert.equal(serialized.includes('base64'), false);
});
