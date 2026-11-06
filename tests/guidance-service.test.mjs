import assert from 'node:assert/strict';
import test from 'node:test';
import { GuidanceService } from '../src/main/services/guidance.ts';

const page = (overrides = {}) => ({
  id: 1,
  title: '注意力与带宽',
  body: '注意力是一种有限资源。',
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 0,
  messages: [
    {
      role: 'teacher',
      text: '你写的“注意力”是指什么？',
      requestId: 'opening',
    },
  ],
  ...overrides,
});

const retrievalPage = {
  id: 2,
  title: '注意力与任务',
  body: '注意力需要主动分配。',
  source: '课程',
  updatedAt: '2026-11-04 00:00:00',
};

const validDecision = {
  needDeeperUnderstanding: true,
  reason: '两页都在讨论注意力如何分配。',
  suggestions: [
    {
      relatedPageIds: [2],
      why: '旧页讨论主动分配，这页讨论有限。',
      question: '你说注意力有限，那有限的是总量还是分配？',
    },
  ],
};

const createRepository = ({
  currentPage = page(),
  pages = [retrievalPage],
  finalizeResult,
  useResult = { ok: true, question: '问题？', guidance: { status: 'needed' } },
} = {}) => {
  const calls = {
    finalize: [],
    use: [],
    retrieval: [],
  };
  const repository = {
    findById(id) {
      return id === currentPage.id ? currentPage : null;
    },
    searchPagesForRetrieval(excludePageId, terms, limit) {
      calls.retrieval.push({ excludePageId, terms, limit });
      return pages;
    },
    finalizeGuidance(pageId, guidance, options) {
      calls.finalize.push({ pageId, guidance, options });
      return finalizeResult === undefined
        ? { ...currentPage, guidance }
        : finalizeResult;
    },
    useGuidanceSuggestion(pageId, suggestionId) {
      calls.use.push({ pageId, suggestionId });
      return useResult;
    },
  };

  return { repository, calls };
};

const createPlanner = (planFn) => ({
  plan: planFn,
});

test('有相关旧页时应持久化 needed 并移除开场问题', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, calls } = createRepository();
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => validDecision),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.equal(calls.retrieval.length, 1);
  assert.equal(calls.retrieval[0].excludePageId, 1);
  assert.equal(calls.retrieval[0].limit, 100);
  assert.ok(calls.retrieval[0].terms.length > 0);
  assert.equal(calls.finalize.length, 1);
  assert.equal(calls.finalize[0].options.removeOpening, true);
  assert.equal(calls.finalize[0].options.expectedBody, page().body);
  assert.equal(calls.finalize[0].guidance.status, 'needed');
  assert.equal(calls.finalize[0].guidance.suggestions.length, 1);
  assert.equal(calls.finalize[0].guidance.suggestions[0].id, 'g-2');
  assert.deepEqual(
    calls.finalize[0].guidance.suggestions[0].relatedPageIds,
    [2],
  );
  assert.deepEqual(calls.finalize[0].guidance.suggestions[0].notes, [
    {
      pageId: 2,
      title: '注意力与任务',
      source: '课程',
      excerpt: '注意力需要主动分配。',
    },
  ]);
  assert.equal(calls.finalize[0].guidance.suggestions[0].anchorQuote, '注意力');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].pageId, 1);
  assert.equal(emitted[0].guidance.status, 'needed');
});

test('多个匹配旧念头应合并成一张接点卡片', async (t) => {
  t.mock.method(console, 'error', () => {});
  const secondPage = {
    id: 3,
    title: '任务牵引',
    body: '任务会牵引注意力。',
    source: '课程',
    updatedAt: '2026-11-03 00:00:00',
  };
  const { repository, calls } = createRepository({
    pages: [retrievalPage, secondPage],
  });
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => ({
      needDeeperUnderstanding: true,
      suggestions: [
        {
          relatedPageIds: [2, 3],
          why: '两页分别讲了分配和牵引，当前页讲有限。',
          question:
            '你写过注意力需要主动分配，也写过任务会牵引它，那这页说的“有限”到底卡在哪？',
        },
      ],
    })),
  );

  await service.run(1, (event) => emitted.push(event));

  const suggestion = calls.finalize[0].guidance.suggestions[0];
  assert.equal(suggestion.id, 'g-2-3');
  assert.deepEqual(suggestion.relatedPageIds, [2, 3]);
  assert.deepEqual(suggestion.notes, [
    {
      pageId: 2,
      title: '注意力与任务',
      source: '课程',
      excerpt: '注意力需要主动分配。',
    },
    {
      pageId: 3,
      title: '任务牵引',
      source: '课程',
      excerpt: '任务会牵引注意力。',
    },
  ]);
  assert.equal(suggestion.anchorQuote, '注意力');
  assert.equal(emitted[0].guidance.suggestions.length, 1);
});

test('模型判断不需要时应写 not_needed 并移除开场问题', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, calls } = createRepository();
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => ({
      needDeeperUnderstanding: false,
      reason: '只是记录。',
      suggestions: [],
    })),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.equal(calls.finalize[0].guidance.status, 'not_needed');
  assert.equal(calls.finalize[0].options.removeOpening, true);
  assert.equal(calls.finalize[0].guidance.suggestions.length, 0);
  assert.equal(emitted[0].guidance.status, 'not_needed');
});

test('需要深挖但没有候选时应写 no_candidates 并保留开场问题', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, calls } = createRepository({ pages: [] });
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => ({
      needDeeperUnderstanding: true,
      suggestions: [],
    })),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.equal(calls.finalize[0].guidance.status, 'no_candidates');
  assert.equal(calls.finalize[0].options.removeOpening, false);
  assert.equal(emitted[0].guidance.status, 'no_candidates');
});

test('判定失败时应写 failed 并保留开场问题', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, calls } = createRepository();
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => {
      throw new Error('model down');
    }),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.equal(calls.finalize[0].guidance.status, 'failed');
  assert.equal(calls.finalize[0].options.removeOpening, false);
  assert.equal(emitted[0].guidance.status, 'failed');
});

test('召回失败也应降级为 failed', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, calls } = createRepository();
  repository.searchPagesForRetrieval = () => {
    throw new Error('db down');
  };
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => validDecision),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.equal(calls.finalize[0].guidance.status, 'failed');
});

test('页面不存在、已关闭或已有用户消息时不应判定', async (t) => {
  t.mock.method(console, 'error', () => {});
  const cases = [
    page({ status: 'closed' }),
    page({ messages: [{ role: 'user', text: '我先写一句。' }] }),
    page({
      guidance: {
        status: 'needed',
        suggestions: [],
        bodyHash: 'x',
        updatedAt: 1,
      },
    }),
  ];

  for (const currentPage of cases) {
    const { repository, calls } = createRepository({ currentPage });
    const service = new GuidanceService(
      repository,
      createPlanner(async () => validDecision),
    );

    await service.run(1, () => {});
    assert.equal(calls.finalize.length, 0);
  }

  const { repository, calls } = createRepository();
  const service = new GuidanceService(
    repository,
    createPlanner(async () => validDecision),
  );
  await service.run(999, () => {});
  assert.equal(calls.finalize.length, 0);
});

test('持久化返回 null 时不应发送事件', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository } = createRepository({ finalizeResult: null });
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => validDecision),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.deepEqual(emitted, []);
});

test('持久化抛错时应发送内存态的 failed', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository } = createRepository();
  repository.finalizeGuidance = () => {
    throw new Error('write down');
  };
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => validDecision),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].guidance.status, 'failed');
});

test('同一页面的并发判定应复用同一个任务', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, calls } = createRepository();
  let resolvePlan;
  const planPromise = new Promise((resolve) => {
    resolvePlan = resolve;
  });
  const service = new GuidanceService(
    repository,
    createPlanner(() => planPromise),
  );

  const first = service.run(1, () => {});
  const second = service.run(1, () => {});
  assert.equal(first, second);

  resolvePlan(validDecision);
  await first;

  assert.equal(calls.finalize.length, 1);
});

test('use 应校验 payload 并委托仓储', () => {
  const { repository, calls } = createRepository();
  const service = new GuidanceService(
    repository,
    createPlanner(async () => validDecision),
  );

  for (const payload of [
    null,
    {},
    { pageId: 0, suggestionId: 'g-2' },
    { pageId: 1, suggestionId: '' },
    { pageId: 1.5, suggestionId: 'g-2' },
  ]) {
    assert.deepEqual(service.use(payload), {
      ok: false,
      errorCode: 'TEACHER_INVALID_REQUEST',
    });
  }

  assert.equal(calls.use.length, 0);
  assert.equal(
    service.use({ pageId: 1, suggestionId: ' g-2 ' }),
    repository.useGuidanceSuggestion(1, 'g-2'),
  );
});

test('服务与真实仓储应完成一次引导闭环', async (t) => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { openDatabase, allocateDatabasePath, closeDatabase } =
    await import('../src/main/db/client.ts');
  const { PagesRepository } = await import('../src/main/db/pages.ts');
  const directory = await mkdtemp(
    path.join(tmpdir(), 'tap-along-guidance-e2e-'),
  );
  const db = openDatabase(allocateDatabasePath(directory));
  t.after(async () => {
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });
  const repository = new PagesRepository(db);
  const related = repository.create('注意力需要主动分配。', '课程');
  const current = repository.create('注意力是一种有限资源。', '课程', {
    text: '你写的“注意力”是指什么？',
    requestId: 'opening',
  });
  const emitted = [];
  const planner = createPlanner(async () => ({
    needDeeperUnderstanding: true,
    suggestions: [
      {
        relatedPageIds: [related.id],
        why: '两页都在讨论注意力。',
        question: '你说的有限，是总量有限还是分配有限？',
      },
    ],
  }));
  const service = new GuidanceService(repository, planner);

  await service.run(current.id, (event) => emitted.push(event));

  const saved = repository.findById(current.id);
  assert.equal(saved.guidance.status, 'needed');
  assert.equal(saved.guidance.suggestions[0].id, `g-${related.id}`);
  assert.equal(
    saved.messages.some((message) => message.requestId === 'opening'),
    false,
  );

  const used = service.use({
    pageId: current.id,
    suggestionId: saved.guidance.suggestions[0].id,
  });
  assert.equal(used.ok, true);
  const updated = repository.findById(current.id);
  assert.equal(updated.messages.length, 1);
  assert.equal(updated.messages[0].requestId, `guidance-g-${related.id}`);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].guidance.status, 'needed');
});

test('refresh 模式应允许用户消息且只处理 needed', async (t) => {
  t.mock.method(console, 'error', () => {});
  const currentPage = page({
    messages: [
      { role: 'user', text: '我先写一句。', requestId: 'u1' },
      { role: 'teacher', text: '改过批注了。', requestId: 'm1' },
    ],
  });
  const { repository, calls } = createRepository({ currentPage });
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => validDecision),
  );

  await service.run(1, (event) => emitted.push(event), { mode: 'refresh' });

  assert.equal(calls.finalize.length, 1);
  assert.equal(calls.finalize[0].options.removeOpening, false);
  assert.equal(calls.finalize[0].options.allowUserMessages, true);
  assert.equal(calls.finalize[0].options.expectedMessageCount, 2);
  assert.equal(emitted[0].guidance.status, 'needed');

  const silentPage = page({
    messages: [{ role: 'user', text: '用户消息。', requestId: 'u2' }],
  });
  const silent = createRepository({ currentPage: silentPage });
  const silentEmitted = [];
  const silentService = new GuidanceService(
    silent.repository,
    createPlanner(async () => ({
      needDeeperUnderstanding: false,
      suggestions: [],
    })),
  );
  await silentService.run(1, (event) => silentEmitted.push(event), {
    mode: 'refresh',
  });
  assert.equal(silent.calls.finalize.length, 0);
  assert.deepEqual(silentEmitted, []);

  const failed = createRepository({ currentPage: silentPage });
  const failedEmitted = [];
  const failedService = new GuidanceService(
    failed.repository,
    createPlanner(async () => {
      throw new Error('planner down');
    }),
  );
  await failedService.run(1, (event) => failedEmitted.push(event), {
    mode: 'refresh',
  });
  assert.equal(failed.calls.finalize.length, 0);
  assert.deepEqual(failedEmitted, []);
});

test('refresh 应拒绝已有关闭或已有 guidance 的页面', async (t) => {
  t.mock.method(console, 'error', () => {});
  const cases = [
    page({ status: 'closed' }),
    page({
      guidance: {
        status: 'needed',
        suggestions: [],
        bodyHash: 'x',
        updatedAt: 1,
      },
    }),
  ];

  for (const currentPage of cases) {
    const { repository, calls } = createRepository({ currentPage });
    const service = new GuidanceService(
      repository,
      createPlanner(async () => validDecision),
    );
    await service.run(1, () => {}, { mode: 'refresh' });
    assert.equal(calls.finalize.length, 0);
  }
});

test('refresh 参数校验和初始任务后的排队', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository } = createRepository();
  const service = new GuidanceService(
    repository,
    createPlanner(async () => validDecision),
  );

  assert.deepEqual(
    service.refresh(null, () => {}),
    {
      ok: false,
      errorCode: 'TEACHER_INVALID_REQUEST',
    },
  );
  assert.deepEqual(
    service.refresh({ pageId: 1, mode: 'initial' }, () => {}),
    {
      ok: false,
      errorCode: 'TEACHER_INVALID_REQUEST',
    },
  );

  let releaseInitial;
  const initialPlan = new Promise((resolve) => {
    releaseInitial = resolve;
  });
  let planIndex = 0;
  const queued = new GuidanceService(
    repository,
    createPlanner(() => {
      planIndex += 1;
      return planIndex === 1 ? initialPlan : Promise.resolve(validDecision);
    }),
  );
  const initial = queued.run(1, () => {});
  const refresh = queued.run(1, () => {}, { mode: 'refresh' });
  releaseInitial(validDecision);
  await Promise.all([initial, refresh]);

  assert.equal(planIndex, 2);
});

test('retry 应只重新处理 failed 或 no_candidates', async (t) => {
  t.mock.method(console, 'error', () => {});
  const failedPage = page({
    guidance: {
      status: 'failed',
      suggestions: [],
      bodyHash: 'old',
      updatedAt: 1,
    },
  });
  const { repository, calls } = createRepository({ currentPage: failedPage });
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => validDecision),
  );

  await service.run(1, (event) => emitted.push(event), { mode: 'retry' });

  assert.equal(calls.finalize.length, 1);
  assert.equal(calls.finalize[0].guidance.status, 'needed');
  assert.equal(calls.finalize[0].options.removeOpening, true);
  assert.equal('allowUserMessages' in calls.finalize[0].options, false);
  assert.equal(emitted[0].guidance.status, 'needed');

  const noCandidatePage = page({
    guidance: {
      status: 'no_candidates',
      suggestions: [],
      bodyHash: 'old',
      updatedAt: 1,
    },
  });
  const noCandidate = createRepository({ currentPage: noCandidatePage });
  const noCandidateService = new GuidanceService(
    noCandidate.repository,
    createPlanner(async () => validDecision),
  );
  await noCandidateService.run(1, () => {}, { mode: 'retry' });
  assert.equal(noCandidate.calls.finalize.length, 1);
  assert.equal(noCandidate.calls.finalize[0].guidance.status, 'needed');

  for (const currentPage of [
    page({
      guidance: {
        status: 'needed',
        suggestions: [],
        bodyHash: 'old',
        updatedAt: 1,
      },
    }),
    page({
      messages: [{ role: 'user', text: '已经开始聊了。', requestId: 'u1' }],
      guidance: {
        status: 'failed',
        suggestions: [],
        bodyHash: 'old',
        updatedAt: 1,
      },
    }),
  ]) {
    const skipped = createRepository({ currentPage });
    const skippedService = new GuidanceService(
      skipped.repository,
      createPlanner(async () => validDecision),
    );
    await skippedService.run(1, () => {}, { mode: 'retry' });
    assert.equal(skipped.calls.finalize.length, 0);
  }
});

test('retry 失败时应写回 failed 而不是静默', async (t) => {
  t.mock.method(console, 'error', () => {});
  const failedPage = page({
    guidance: {
      status: 'no_candidates',
      suggestions: [],
      bodyHash: 'old',
      updatedAt: 1,
    },
  });
  const { repository, calls } = createRepository({ currentPage: failedPage });
  const emitted = [];
  const service = new GuidanceService(
    repository,
    createPlanner(async () => {
      throw new Error('planner down');
    }),
  );

  await service.run(1, (event) => emitted.push(event), { mode: 'retry' });

  assert.equal(calls.finalize.length, 1);
  assert.equal(calls.finalize[0].guidance.status, 'failed');
  assert.equal(calls.finalize[0].options.removeOpening, false);
  assert.equal(emitted[0].guidance.status, 'failed');
});

test('guidance:run 应接受 retry 并拒绝其他模式', () => {
  const { repository } = createRepository();
  const service = new GuidanceService(
    repository,
    createPlanner(async () => validDecision),
  );

  assert.deepEqual(
    service.refresh({ pageId: 1, mode: 'initial' }, () => {}),
    {
      ok: false,
      errorCode: 'TEACHER_INVALID_REQUEST',
    },
  );
  assert.deepEqual(
    service.refresh({ pageId: 1, mode: 'retry' }, () => {}),
    {
      ok: true,
    },
  );
});
