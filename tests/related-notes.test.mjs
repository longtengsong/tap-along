import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractTerms,
  findRelatedNotes,
} from '../src/main/services/related-notes.ts';

const page = (id, body, source = '课程', title = `页边 ${id}`) => ({
  id,
  title,
  body,
  source,
  updatedAt: `2026-11-0${id} 00:00:00`,
});

test('中文笔记应按 2/3 字重叠找到相关旧页', () => {
  const current = page(1, '注意力是一种有限资源。');
  const related = findRelatedNotes(current, [
    page(2, '注意力需要主动分配。', '课程', '注意力与任务'),
    page(3, '今天读到第四十二页。', '日记', '读书进度'),
  ]);

  assert.equal(related.length, 1);
  assert.equal(related[0].pageId, 2);
  assert.equal(related[0].title, '注意力与任务');
  assert.ok(related[0].score > 0);
  assert.ok(related[0].snippet.includes('注意力'));
});

test('英文笔记应按单词重叠召回并忽略常见停用词', () => {
  const current = page(1, 'Attention is a limited resource.');
  const related = findRelatedNotes(current, [
    page(2, 'We need to allocate attention carefully.', '课程', 'Attention'),
    page(3, 'The weather is nice today.', '日记', 'Weather'),
  ]);

  assert.equal(related.length, 1);
  assert.equal(related[0].pageId, 2);
  assert.equal(related[0].title, 'Attention');
});

test('同一出处应增加权重但不能让完全无关页进入结果', () => {
  const current = page(1, '注意力是有限的。', '课程');
  const related = findRelatedNotes(current, [
    page(2, '今天天气不错。', '课程'),
    page(3, '注意力需要分配。', '别的书'),
  ]);

  assert.equal(related.length, 1);
  assert.equal(related[0].pageId, 3);
});

test('召回应排除当前页并保持最近顺序', () => {
  const current = page(2, '注意力是有限的。');
  const related = findRelatedNotes(current, [
    page(2, '注意力是有限的。'),
    page(3, '注意力需要分配。'),
    page(4, '注意力会被任务牵引。'),
  ]);

  assert.deepEqual(
    related.map((item) => item.pageId),
    [3, 4],
  );
});

test('没有共同词项或限制非法时应返回空数组', () => {
  const current = page(1, '注意力是有限的。');

  assert.deepEqual(findRelatedNotes(current, [page(2, '今天天气不错。')]), []);
  assert.deepEqual(
    findRelatedNotes(current, [page(2, '注意力需要分配。')], 0),
    [],
  );
  assert.deepEqual(
    findRelatedNotes({ ...current, body: '' }, [page(2, '注意力需要分配。')]),
    [],
  );
});

test('片段应限制在 240 字以内，且无命中时取正文开头', () => {
  const current = page(1, '注意力');
  const longBody = `注意力${'很长的内容'.repeat(100)}`;
  const related = findRelatedNotes(current, [page(2, longBody)]);

  assert.equal(related.length, 1);
  assert.ok(related[0].snippet.length <= 240);

  const noHitCurrent = page(1, '注意力');
  const noHit = findRelatedNotes(noHitCurrent, [page(3, '注意力')]);
  assert.equal(noHit[0].snippet, '注意力');
});

test('词项提取应过滤停用词并限制数量', () => {
  const terms = extractTerms(
    '这是一个注意力的注意力问题 attention attention the',
  );
  assert.equal(terms.has('一个'), false);
  assert.equal(terms.has('the'), false);
  assert.ok(terms.has('注意'));
  assert.ok(terms.has('attention'));
  assert.ok(terms.size <= 60);
});
