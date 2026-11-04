import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDomain,
  domainFromUrl,
  isEvidenceSufficient,
  normalizeHttpUrl,
  rankSearchItems,
} from '../src/main/services/search-policy.ts';

const item = (overrides = {}) => ({
  title: 'title',
  url: 'https://example.com/a',
  domain: 'example.com',
  snippet: 'snippet',
  tier: 'general',
  score: 1,
  ...overrides,
});

test('URL 规范化应只接受 http/https 并去掉追踪参数', () => {
  assert.equal(
    normalizeHttpUrl('https://www.example.com/a?utm_source=x&id=1#h'),
    'https://www.example.com/a?id=1',
  );
  assert.equal(normalizeHttpUrl('http://example.com'), 'http://example.com/');
  assert.equal(normalizeHttpUrl('file:///etc/passwd'), null);
  assert.equal(normalizeHttpUrl('https://user:pass@example.com'), null);
  assert.equal(normalizeHttpUrl('not a url'), null);
  assert.equal(normalizeHttpUrl(null), null);
});

test('域名提取应去掉 www 前缀', () => {
  assert.equal(domainFromUrl('https://www.example.com/a'), 'example.com');
  assert.equal(domainFromUrl('https://news.example.com/a'), 'news.example.com');
  assert.equal(domainFromUrl('ftp://example.com'), null);
  assert.equal(domainFromUrl('bad'), null);
});

test('来源分级应覆盖官方、参考、新闻、UGC 和一般网站', () => {
  assert.equal(classifyDomain('who.int'), 'official');
  assert.equal(classifyDomain('example.gov'), 'official');
  assert.equal(classifyDomain('en.wikipedia.org'), 'reference');
  assert.equal(classifyDomain('reuters.com'), 'news');
  assert.equal(classifyDomain('zhihu.com'), 'ugc');
  assert.equal(classifyDomain('example.com'), 'general');
});

test('排序应优先来源级别，同级按 provider 分数', () => {
  const ranked = rankSearchItems([
    item({ title: 'general', tier: 'general', score: 100 }),
    item({ title: 'official', tier: 'official', score: 1 }),
    item({ title: 'news-high', tier: 'news', score: 10 }),
    item({ title: 'news-low', tier: 'news', score: 2 }),
  ]);

  assert.deepEqual(
    ranked.map((entry) => entry.title),
    ['official', 'news-high', 'news-low', 'general'],
  );
});

test('证据充分性要求至少一条官方/参考/新闻来源', () => {
  assert.equal(isEvidenceSufficient([item({ tier: 'ugc' })]), false);
  assert.equal(isEvidenceSufficient([item({ tier: 'general' })]), false);
  assert.equal(isEvidenceSufficient([item({ tier: 'reference' })]), true);
  assert.equal(isEvidenceSufficient([]), false);
});
