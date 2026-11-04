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
import { PagesRepository } from '../src/main/db/pages.ts';

const createRepository = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-research-'));
  const db = openDatabase(allocateDatabasePath(directory));
  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });
  return { db, repository: new PagesRepository(db) };
};

const sources = [
  {
    index: 1,
    title: 'Cognitive load',
    url: 'https://en.wikipedia.org/wiki/Cognitive_load',
    domain: 'en.wikipedia.org',
  },
];

test('联网回答应持久化来源和模式且不增加教学轮次', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程');

  const saved = repository.completeResearchAnswer(
    page.id,
    '认知负荷是工作记忆的负担 [1]。',
    sources,
    'research-1',
  );

  assert.ok(saved);
  assert.equal(saved.teachingRoundCount, 0);
  assert.equal(saved.messages.length, 1);
  assert.equal(saved.messages[0].role, 'teacher');
  assert.equal(saved.messages[0].mode, 'answer');
  assert.deepEqual(saved.messages[0].sources, sources);
  assert.equal(saved.messages[0].requestId, 'research-1');

  const reloaded = repository.findById(page.id);
  assert.deepEqual(reloaded.messages[0].sources, sources);
  assert.equal(reloaded.messages[0].mode, 'answer');
});

test('相同 requestId 不应重复写入联网回答', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程');

  repository.completeResearchAnswer(
    page.id,
    '第一次回答 [1]。',
    sources,
    'r-1',
  );
  const second = repository.completeResearchAnswer(
    page.id,
    '第二次回答 [1]。',
    sources,
    'r-1',
  );

  assert.equal(second.messages.length, 1);
  assert.equal(second.messages[0].text, '第一次回答 [1]。');
  assert.equal(repository.completeResearchAnswer(999, 'x', [], 'r-2'), null);
});

test('损坏或非法来源应在读取时被丢弃', async (t) => {
  const { db, repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程');

  db.prepare('UPDATE pages SET companion_log = ? WHERE id = ?').run(
    JSON.stringify([
      {
        role: 'teacher',
        text: '带来源的回答。',
        mode: 'answer',
        requestId: 'r-1',
        sources: [
          {
            index: 1,
            title: '非法链接',
            url: 'file:///etc/passwd',
            domain: 'local',
          },
          {
            index: 2,
            title: '合法链接',
            url: 'https://example.edu/a',
            domain: 'example.edu',
          },
          {
            index: 2,
            title: '重复编号',
            url: 'https://example.edu/b',
            domain: 'example.edu',
          },
        ],
      },
    ]),
    page.id,
  );

  const saved = repository.findById(page.id);
  assert.equal(saved.messages[0].sources.length, 1);
  assert.equal(saved.messages[0].sources[0].index, 2);
  assert.equal(saved.messages[0].mode, 'answer');
});

test('清空全部会话应删除联网回答', async (t) => {
  const { repository } = await createRepository(t);
  const page = repository.create('注意力是有限资源。', '课程');
  repository.completeResearchAnswer(page.id, '回答 [1]。', sources, 'r-1');

  assert.equal(repository.clearAll(), 1);
  assert.equal(repository.findById(page.id), null);
});
