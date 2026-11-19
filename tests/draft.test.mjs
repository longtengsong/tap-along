import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DRAFT_STORAGE_KEY,
  clearDraftSnapshot,
  loadDraftSnapshot,
  parseDraftSnapshot,
  saveDraftSnapshot,
} from '../src/shared/draft.ts';
import { docFromPlainText } from '../src/shared/note-doc.ts';

const createStorage = () => {
  const values = new Map();

  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
};

test('草稿应可序列化、读回并清空', () => {
  const storage = createStorage();
  const doc = docFromPlainText('注意力是有限资源。');

  saveDraftSnapshot(storage, { version: 2, doc, source: '课程' });

  assert.deepEqual(loadDraftSnapshot(storage), {
    version: 2,
    doc,
    source: '课程',
  });

  clearDraftSnapshot(storage);
  assert.equal(loadDraftSnapshot(storage), null);
  assert.equal(storage.values.has(DRAFT_STORAGE_KEY), false);
});

test('旧版 body 草稿应自动转换为文档', () => {
  const snapshot = parseDraftSnapshot(
    JSON.stringify({ body: '旧草稿正文', source: '旧出处' }),
  );

  assert.deepEqual(snapshot, {
    version: 2,
    doc: docFromPlainText('旧草稿正文'),
    source: '旧出处',
  });
});

test('空内容、坏 JSON 和错误字段应被忽略', () => {
  const storage = createStorage();

  assert.equal(parseDraftSnapshot(null), null);
  assert.equal(parseDraftSnapshot(''), null);
  assert.equal(parseDraftSnapshot('{'), null);
  assert.equal(parseDraftSnapshot('[]'), null);
  assert.equal(
    parseDraftSnapshot(JSON.stringify({ body: 1, source: '课程' })),
    null,
  );
  assert.equal(
    parseDraftSnapshot(JSON.stringify({ body: '  ', source: ' ' })),
    null,
  );
  assert.equal(
    parseDraftSnapshot(
      JSON.stringify({ version: 2, doc: { type: 'doc' }, source: '' }),
    ),
    null,
  );

  saveDraftSnapshot(storage, {
    version: 2,
    doc: docFromPlainText('  '),
    source: ' ',
  });
  assert.equal(storage.values.has(DRAFT_STORAGE_KEY), false);
});

test('超长草稿不写入也不恢复', () => {
  const storage = createStorage();
  const doc = docFromPlainText('x'.repeat(2_000_001));

  saveDraftSnapshot(storage, { version: 2, doc, source: '' });
  assert.equal(storage.values.has(DRAFT_STORAGE_KEY), false);

  assert.equal(
    parseDraftSnapshot(JSON.stringify({ version: 2, doc, source: '' })),
    null,
  );
});

test('存储读写异常不应抛出', () => {
  const broken = {
    getItem() {
      throw new Error('read failed');
    },
    setItem() {
      throw new Error('write failed');
    },
    removeItem() {
      throw new Error('remove failed');
    },
  };
  const doc = docFromPlainText('内容');

  assert.equal(loadDraftSnapshot(broken), null);
  assert.doesNotThrow(() =>
    saveDraftSnapshot(broken, { version: 2, doc, source: '' }),
  );
  assert.doesNotThrow(() => clearDraftSnapshot(broken));
});
