import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { openDatabase } from '../src/main/db/client.ts';
import { PagesRepository } from '../src/main/db/pages.ts';
import {
  extractTerms,
  findRelatedNotes,
} from '../src/main/services/related-notes.ts';

const fixturePath = new URL('./fixtures/retrieval/cases.json', import.meta.url);

const loadFixture = async () => JSON.parse(await readFile(fixturePath, 'utf8'));

const runCase = (testCase) => {
  const db = openDatabase(':memory:');

  try {
    const repository = new PagesRepository(db);
    const current = repository.create(
      testCase.current.body,
      testCase.current.source,
    );
    const idMap = new Map();

    for (const page of testCase.pages) {
      const created = repository.create(page.body, page.source);
      idMap.set(page.id, created.id);
    }

    const terms = [...extractTerms(testCase.current.body).keys()];
    const candidates = findRelatedNotes(
      {
        id: current.id,
        body: testCase.current.body,
        source: testCase.current.source,
      },
      repository.searchPagesForRetrieval(current.id, terms, 100),
    );
    const topFive = candidates.slice(0, 5).map((item) => item.pageId);
    const expected = testCase.expectedRelatedPageIds.map((id) => idMap.get(id));
    const hit = expected.some((id) => topFive.includes(id));

    return { hit, topFive, expected, candidates };
  } finally {
    db.close();
  }
};

test('召回夹具应结构完整且覆盖 20 个场景', async () => {
  const fixture = await loadFixture();

  assert.equal(fixture.version, 1);
  assert.ok(Array.isArray(fixture.cases));
  assert.ok(fixture.cases.length >= 20);

  for (const testCase of fixture.cases) {
    assert.ok(testCase.id);
    assert.ok(testCase.current?.body);
    assert.ok(Array.isArray(testCase.pages));
    assert.ok(testCase.pages.length > 0);
    assert.ok(testCase.expectedRelatedPageIds.length > 0);
  }
});

test('短词召回升级后 recall@5 应达到 80% 基线', async (t) => {
  const fixture = await loadFixture();
  const failures = [];
  let hits = 0;

  for (const testCase of fixture.cases) {
    const result = runCase(testCase);

    if (result.hit) {
      hits += 1;
    } else {
      failures.push({
        id: testCase.id,
        expected: result.expected,
        topFive: result.topFive,
      });
    }
  }

  const recall = hits / fixture.cases.length;

  await t.test(`recall@5 = ${(recall * 100).toFixed(1)}%`, () => {
    assert.ok(
      recall >= 0.8,
      `recall@5 低于 80%：\n${JSON.stringify(failures, null, 2)}`,
    );
  });
});
