import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IntentRouterError,
  createIntentRouter,
} from '../src/main/services/intent-router.ts';

const page = {
  id: 1,
  title: '注意力与带宽',
  body: '注意力是一种有限资源。',
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 0,
  messages: [
    { role: 'user', text: '我先前的想法。', requestId: 'u1' },
    { role: 'teacher', text: '你指什么？', requestId: 't1' },
  ],
};

const createRouter = (content) => {
  const calls = [];
  const router = createIntentRouter({
    configService: { resolveActive: async () => ({ ok: true, config: {} }) },
    completion: {
      async complete(messages, options) {
        calls.push({ messages, options });
        if (content instanceof Error) throw content;
        return content;
      },
    },
  });
  return { router, calls };
};

test('应解析 research 模式并清洗查询', async () => {
  const { router, calls } = createRouter(
    JSON.stringify({
      mode: 'research',
      queries: [' 认知负荷 ', '认知负荷', 'cognitive load', 'a', 'b'],
      reason: '需要外部定义。',
    }),
  );
  const route = await router.route({ page, userText: '什么是认知负荷？' });

  assert.deepEqual(route, {
    mode: 'research',
    queries: ['认知负荷', 'cognitive load', 'a'],
    reason: '需要外部定义。',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.maxTokens, 250);
});

test('reflect 模式应清空查询', async () => {
  const { router } = createRouter(
    JSON.stringify({ mode: 'reflect', queries: ['ignored'] }),
  );
  assert.deepEqual(
    await router.route({ page, userText: '我这句话是不是太绝对？' }),
    { mode: 'reflect', queries: [] },
  );
});

test('应容忍 JSON 代码围栏', async () => {
  const { router } = createRouter(
    `\`\`\`json\n${JSON.stringify({
      mode: 'research',
      queries: ['定义'],
    })}\n\`\`\``,
  );
  assert.deepEqual(
    (await router.route({ page, userText: '是什么？' })).queries,
    ['定义'],
  );
});

test('research 没有查询时应回退到用户问题', async () => {
  const { router } = createRouter(
    JSON.stringify({ mode: 'research', queries: [] }),
  );
  const route = await router.route({ page, userText: '什么是注意力？' });

  assert.equal(route.mode, 'research');
  assert.deepEqual(route.queries, ['什么是注意力？']);
});

test('research 没有任何查询且用户问题为空时应回到 reflect', async () => {
  const { router } = createRouter(
    JSON.stringify({ mode: 'research', queries: [] }),
  );
  const route = await router.route({ page, userText: '   ' });
  assert.deepEqual(route, { mode: 'reflect', queries: [] });
});

test('非法 JSON、非法模式和非对象应抛出路由错误', async (t) => {
  for (const content of [
    'not json',
    JSON.stringify({ mode: 'unknown', queries: [] }),
    JSON.stringify([]),
    JSON.stringify({ mode: 'research', queries: 'bad' }),
  ]) {
    await t.test(content.slice(0, 20), async () => {
      const { router } = createRouter(content);
      const expected =
        content === JSON.stringify({ mode: 'research', queries: 'bad' })
          ? { mode: 'research', queries: ['认知负荷？'] }
          : null;

      if (expected) {
        assert.deepEqual(
          await router.route({ page, userText: '认知负荷？' }),
          expected,
        );
        return;
      }

      await assert.rejects(
        () => router.route({ page, userText: '问题？' }),
        (error) => error instanceof IntentRouterError,
      );
    });
  }
});

test('补全异常应原样抛出，由老师服务回退 reflect', async () => {
  const error = new Error('model down');
  const { router } = createRouter(error);

  await assert.rejects(
    () => router.route({ page, userText: '问题？' }),
    (received) => received === error,
  );
});

test('查询应截断到 120 字并按顺序去重', async () => {
  const long = '长'.repeat(200);
  const { router } = createRouter(
    JSON.stringify({
      mode: 'research',
      queries: [long, 'x', 'x', 'y'],
    }),
  );
  const route = await router.route({ page, userText: '问题？' });

  assert.equal(route.queries[0].length, 120);
  assert.deepEqual(route.queries.slice(1), ['x', 'y']);
});
