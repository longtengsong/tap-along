import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafeExternalUrl } from '../src/shared/shell.ts';

test('外部链接只允许干净的 http/https 地址', () => {
  assert.equal(isSafeExternalUrl('https://example.com/a'), true);
  assert.equal(isSafeExternalUrl('http://example.com'), true);
  assert.equal(isSafeExternalUrl('file:///etc/passwd'), false);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('data:text/html,hi'), false);
  assert.equal(isSafeExternalUrl('https://user:pass@example.com'), false);
  assert.equal(isSafeExternalUrl('not a url'), false);
  assert.equal(isSafeExternalUrl(''), false);
  assert.equal(isSafeExternalUrl(null), false);
});

test('外链 IPC 应拒绝非法地址并调用受控打开函数', async () => {
  const { registerShellHandlers } = await import('../src/main/ipc/shell.ts');
  const handlers = new Map();
  const calls = [];
  registerShellHandlers(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    async (url) => {
      calls.push(url);

      if (url.includes('fail')) {
        throw new Error('open failed');
      }
    },
  );

  const handler = handlers.get('shell:open-external');
  assert.deepEqual(await handler(null, 'file:///etc/passwd'), {
    ok: false,
    errorCode: 'EXTERNAL_URL_INVALID',
  });
  assert.deepEqual(await handler(null, 'https://example.com/a'), { ok: true });
  assert.deepEqual(calls, ['https://example.com/a']);
  assert.deepEqual(await handler(null, 'https://fail.example.com/a'), {
    ok: false,
    errorCode: 'EXTERNAL_URL_INVALID',
  });
});
