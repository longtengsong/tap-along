import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStartupFailureContent } from '../src/main/services/startup-error.ts';

test('中文启动错误应包含数据目录和中文按钮', () => {
  const content = buildStartupFailureContent({
    error: new Error('database is locked'),
    dataDirectory: '/Users/me/Library/Application Support/tap-along',
    locale: 'zh-CN',
  });

  assert.equal(content.title, '轻叩伴读');
  assert.equal(content.message, '无法打开本地数据');
  assert.match(content.detail, /数据目录：\/Users\/me/);
  assert.match(content.detail, /本地数据暂时打不开/);
  assert.equal(content.openButton, '打开数据目录');
  assert.equal(content.quitButton, '退出');
});

test('英文启动错误应包含目录和英文按钮', () => {
  const content = buildStartupFailureContent({
    error: new Error('database is locked'),
    dataDirectory: '/Users/me/Library/Application Support/tap-along',
    locale: 'en-US',
  });

  assert.equal(content.title, 'TapAlong');
  assert.equal(content.message, 'Could not open your local data');
  assert.match(content.detail, /Data folder: \/Users\/me/);
  assert.equal(content.openButton, 'Open data folder');
  assert.equal(content.quitButton, 'Quit');
});

test('权限错误应给出可读分类，空目录应显示未知', () => {
  const denied = buildStartupFailureContent({
    error: Object.assign(new Error('denied'), { code: 'EACCES' }),
    dataDirectory: '',
    locale: 'zh-CN',
  });

  assert.match(denied.detail, /权限|无法读取或写入/);
  assert.match(denied.detail, /未知/);

  const english = buildStartupFailureContent({
    error: Object.assign(new Error('denied'), { code: 'EPERM' }),
    dataDirectory: '',
    locale: 'en-GB',
  });

  assert.match(english.detail, /cannot be read or written/);
  assert.match(english.detail, /unknown/);
});
