import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GuidanceOutputError,
  createGuidancePlanner,
} from '../src/main/services/guidance-planner.ts';
import { ProviderRequestError } from '../src/main/services/model-teacher.ts';

const page = {
  id: 1,
  title: '注意力与带宽',
  body: '注意力是一种有限资源。',
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 0,
  messages: [],
};

const candidates = [
  {
    pageId: 12,
    title: '注意力与任务',
    source: '课程',
    snippet: '注意力需要主动分配。',
    score: 4,
  },
  {
    pageId: 18,
    title: '任务牵引',
    source: '课程',
    snippet: '任务会牵引注意力。',
    score: 2,
  },
];

const config = {
  id: 'custom',
  baseUrl: 'https://models.example.com/v1',
  model: 'guidance-model',
  apiKey: 'sk-guidance-secret',
};

const contentResponse = (content) => ({
  choices: [{ message: { content } }],
});

const jsonContent = (value) => JSON.stringify(value);

const createPlanner = ({ responses, resolveActive, timeoutMs } = {}) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();

    if (next instanceof Error) {
      throw next;
    }

    if (typeof next === 'function') {
      return next(url, init);
    }

    return {
      ok: true,
      status: 200,
      json: async () => next,
    };
  };
  const planner = createGuidancePlanner({
    configService: {
      resolveActive: resolveActive ?? (async () => ({ ok: true, config })),
    },
    fetchImpl,
    timeoutMs,
  });

  return { planner, calls };
};

const validDecision = {
  needDeeperUnderstanding: true,
  reason: '两页都在讨论注意力如何分配。',
  suggestions: [
    {
      relatedPageId: 12,
      why: '旧页讨论主动分配，这页讨论有限。',
      question: '你说注意力有限，那有限的是总量还是分配？',
    },
  ],
};

test('引导判定应返回合法 JSON 并复用当前模型配置', async () => {
  const { planner, calls } = createPlanner({
    responses: [contentResponse(jsonContent(validDecision))],
  });
  const result = await planner.plan({ page, candidates });

  assert.deepEqual(result, validDecision);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://models.example.com/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${config.apiKey}`);

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 600);
  assert.equal(body.model, config.model);
  assert.match(JSON.stringify(body.messages), /related_page/);
  assert.match(JSON.stringify(body.messages), /注意力与任务/);
});

test('不应答深挖时应丢弃模型多给的接点', async () => {
  const { planner } = createPlanner({
    responses: [
      contentResponse(
        jsonContent({
          ...validDecision,
          needDeeperUnderstanding: false,
        }),
      ),
    ],
  });
  const result = await planner.plan({ page, candidates });

  assert.equal(result.needDeeperUnderstanding, false);
  assert.deepEqual(result.suggestions, []);
});

test('没有候选时允许返回需要深挖但没有接点', async () => {
  const { planner } = createPlanner({
    responses: [
      contentResponse(
        jsonContent({
          needDeeperUnderstanding: true,
          reason: '值得追问，但本地没有旧页。',
          suggestions: [],
        }),
      ),
    ],
  });
  const result = await planner.plan({ page, candidates: [] });

  assert.equal(result.needDeeperUnderstanding, true);
  assert.deepEqual(result.suggestions, []);
});

test('应容忍 JSON 代码围栏', async () => {
  const { planner } = createPlanner({
    responses: [
      contentResponse(`\`\`\`json\n${jsonContent(validDecision)}\n\`\`\``),
    ],
  });

  assert.deepEqual(await planner.plan({ page, candidates }), validDecision);
});

test('非法 JSON 应重试一次后使用第二次结果', async () => {
  const { planner, calls } = createPlanner({
    responses: [
      contentResponse('这不是 JSON'),
      contentResponse(jsonContent(validDecision)),
    ],
  });

  assert.deepEqual(await planner.plan({ page, candidates }), validDecision);
  assert.equal(calls.length, 2);
  assert.match(
    JSON.stringify(JSON.parse(calls[1].init.body).messages),
    /previous output was invalid/i,
  );
});

test('未知 relatedPageId 和非法问题应被丢弃，并可触发重试', async () => {
  const invalid = {
    needDeeperUnderstanding: true,
    suggestions: [
      { relatedPageId: 999, why: '未知页', question: '这是什么？' },
    ],
  };
  const { planner, calls } = createPlanner({
    responses: [
      contentResponse(jsonContent(invalid)),
      contentResponse(jsonContent(validDecision)),
    ],
  });

  assert.deepEqual(await planner.plan({ page, candidates }), validDecision);
  assert.equal(calls.length, 2);
});

test('应过滤不以问号结尾、含换行或超长的问题', async () => {
  const mixed = {
    needDeeperUnderstanding: true,
    suggestions: [
      {
        relatedPageId: 12,
        why: '有效',
        question: '这条为什么成立？',
      },
      {
        relatedPageId: 18,
        why: '无效',
        question: '这条没有问号',
      },
      {
        relatedPageId: 18,
        why: '无效',
        question: '这条\n有换行？',
      },
      {
        relatedPageId: 12,
        why: '重复',
        question: '重复的问题？',
      },
    ],
  };
  const { planner } = createPlanner({
    responses: [contentResponse(jsonContent(mixed))],
  });
  const result = await planner.plan({ page, candidates });

  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].relatedPageId, 12);
  assert.equal(result.suggestions[0].question, '这条为什么成立？');
});

test('最多保留两个接点', async () => {
  const many = {
    needDeeperUnderstanding: true,
    suggestions: [
      { relatedPageId: 12, why: '一', question: '第一个问题？' },
      { relatedPageId: 18, why: '二', question: '第二个问题？' },
      { relatedPageId: 12, why: '三', question: '第三个问题？' },
    ],
  };
  const { planner } = createPlanner({
    responses: [contentResponse(jsonContent(many))],
  });
  const result = await planner.plan({ page, candidates });

  assert.equal(result.suggestions.length, 2);
  assert.deepEqual(
    result.suggestions.map((item) => item.relatedPageId),
    [12, 18],
  );
});

test('reason 应截断到 300 字', async () => {
  const { planner } = createPlanner({
    responses: [
      contentResponse(
        jsonContent({
          ...validDecision,
          reason: '很长'.repeat(200),
        }),
      ),
    ],
  });
  const result = await planner.plan({ page, candidates });
  assert.equal(result.reason.length, 300);
});

test('连续两次非法输出应抛出 GuidanceOutputError', async () => {
  const { planner } = createPlanner({
    responses: [contentResponse('bad'), contentResponse('still bad')],
  });

  await assert.rejects(
    () => planner.plan({ page, candidates }),
    (error) => error instanceof GuidanceOutputError,
  );
});

test('未配置模型时应直接抛出供应商错误', async () => {
  const { planner, calls } = createPlanner({
    responses: [],
    resolveActive: async () => ({
      ok: false,
      errorCode: 'PROVIDER_NOT_CONFIGURED',
    }),
  });

  await assert.rejects(
    () => planner.plan({ page, candidates }),
    (error) => {
      assert.equal(error.name, 'ProviderRequestError');
      assert.equal(error.errorCode, 'PROVIDER_NOT_CONFIGURED');
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

test('HTTP 错误应映射为受控错误码', async (t) => {
  const cases = [
    [401, 'PROVIDER_UNAUTHORIZED'],
    [403, 'PROVIDER_UNAUTHORIZED'],
    [400, 'MODEL_UNAVAILABLE'],
    [404, 'MODEL_UNAVAILABLE'],
    [408, 'PROVIDER_TIMEOUT'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [500, 'PROVIDER_REQUEST_FAILED'],
  ];

  for (const [status, errorCode] of cases) {
    await t.test(String(status), async () => {
      const { planner } = createPlanner({
        responses: [() => ({ ok: false, status, json: async () => ({}) })],
      });

      await assert.rejects(
        () => planner.plan({ page, candidates }),
        (error) => {
          assert.ok(error instanceof ProviderRequestError);
          assert.equal(error.errorCode, errorCode);
          return true;
        },
      );
    });
  }
});

test('网络异常、超时和无效响应应映射为受控错误码', async (t) => {
  await t.test('网络异常', async () => {
    const { planner } = createPlanner({
      responses: [new TypeError('network down')],
    });

    await assert.rejects(
      () => planner.plan({ page, candidates }),
      (error) => {
        assert.equal(error.errorCode, 'PROVIDER_NETWORK_ERROR');
        return true;
      },
    );
  });

  await t.test('超时', async () => {
    const { planner } = createPlanner({
      responses: [
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      ],
      timeoutMs: 5,
    });

    await assert.rejects(
      () => planner.plan({ page, candidates }),
      (error) => {
        assert.equal(error.errorCode, 'PROVIDER_TIMEOUT');
        return true;
      },
    );
  });

  await t.test('无效 JSON 响应', async () => {
    const { planner } = createPlanner({
      responses: [
        () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('bad json');
          },
        }),
      ],
    });

    await assert.rejects(
      () => planner.plan({ page, candidates }),
      (error) => {
        assert.equal(error.errorCode, 'PROVIDER_REQUEST_FAILED');
        return true;
      },
    );
  });

  await t.test('缺少 choices', async () => {
    const { planner } = createPlanner({
      responses: [{}, {}],
    });

    await assert.rejects(
      () => planner.plan({ page, candidates }),
      (error) => error instanceof GuidanceOutputError,
    );
  });
});

test('建议数组缺失时不应误判为有接点', async () => {
  const { planner } = createPlanner({
    responses: [
      contentResponse(
        jsonContent({
          needDeeperUnderstanding: false,
          reason: '只是一条记录。',
        }),
      ),
    ],
  });
  const result = await planner.plan({ page, candidates });

  assert.equal(result.needDeeperUnderstanding, false);
  assert.deepEqual(result.suggestions, []);
  assert.equal(result.reason, '只是一条记录。');
});
