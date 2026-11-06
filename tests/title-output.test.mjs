import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_TITLE_LENGTH,
  normalizeTitle,
} from '../src/main/services/validators/title-output.ts';

test('title validator 应清理引号、标点、代码围栏和多余空白', () => {
  assert.equal(normalizeTitle('注意力像带宽。'), '注意力像带宽');
  assert.equal(normalizeTitle('  「注意力像带宽」  '), '注意力像带宽');
  assert.equal(normalizeTitle('标题：注意力与分配'), '注意力与分配');
  assert.equal(normalizeTitle('```\n注意力像带宽\n```'), '注意力像带宽');
  assert.equal(normalizeTitle('第一行标题\n第二行解释'), '第一行标题');
  assert.equal(normalizeTitle('注意力   像\n带宽'), '注意力 像');
});

test('title validator 应返回空串并截断超长标题', () => {
  assert.equal(normalizeTitle('   '), '');
  assert.equal(normalizeTitle('。。。'), '');
  assert.equal([...normalizeTitle('长'.repeat(100))].length, MAX_TITLE_LENGTH);
});
