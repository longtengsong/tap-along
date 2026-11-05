import assert from 'node:assert/strict';
import test from 'node:test';
import { TitleService } from '../src/main/services/title-service.ts';

const page = (overrides = {}) => ({
  id: 1,
  title: '注意力像带宽',
  body: '注意力是一种有限资源，分配决定能处理多少事。',
  source: '课程',
  status: 'reading',
  parseStatus: 'pending',
  teachingRoundCount: 0,
  messages: [],
  ...overrides,
});

const createRepository = (initial = page()) => {
  const calls = { update: [], sources: [] };
  let current = initial;
  const repository = {
    findById(id) {
      return current && id === current.id ? current : null;
    },
    updateTitle(pageId, title, source = 'model') {
      calls.update.push({ pageId, title });
      calls.sources.push(source);
      current =
        source === 'user'
          ? { ...current, title, titleSource: 'user' }
          : { ...current, title };
      return current;
    },
  };

  return {
    repository,
    calls,
    setPage(next) {
      current = next;
    },
    getPage() {
      return current;
    },
  };
};

const generator = (generate) => ({ generate });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('应生成标题、持久化并发出更新事件', async () => {
  const { repository, calls } = createRepository();
  const emitted = [];
  const service = new TitleService(
    repository,
    generator(async () => '注意力像带宽'),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.deepEqual(calls.update, [{ pageId: 1, title: '注意力像带宽' }]);
  assert.deepEqual(emitted, [{ pageId: 1, title: '注意力像带宽' }]);
});

test('正文太短时应保留截断标题，不调用模型', async () => {
  const { repository, calls } = createRepository(page({ body: '嗯。' }));
  let generated = 0;
  const service = new TitleService(
    repository,
    generator(async () => {
      generated += 1;
      return '短标题';
    }),
  );

  await service.run(1, () => {});

  assert.equal(generated, 0);
  assert.deepEqual(calls.update, []);
});

test('生成失败应静默降级并保留截断标题', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository, calls } = createRepository();
  const service = new TitleService(
    repository,
    generator(async () => {
      throw new Error('provider down');
    }),
  );

  await service.run(1, () => {});

  assert.deepEqual(calls.update, []);
});

test('模型返回空标题时不应写入', async () => {
  const { repository, calls } = createRepository();
  const service = new TitleService(
    repository,
    generator(async () => '   '),
  );

  await service.run(1, () => {});
  assert.deepEqual(calls.update, []);
});

test('生成期间正文被修改时应丢弃旧标题并重算', async () => {
  const initial = page();
  const { repository, calls, setPage } = createRepository(initial);
  let attempts = 0;
  const service = new TitleService(
    repository,
    generator(async () => {
      attempts += 1;

      if (attempts === 1) {
        setPage({ ...initial, body: '改过之后的正文。' });
        return '旧标题';
      }

      return '新标题';
    }),
  );

  await service.run(1, () => {});

  assert.equal(attempts, 2);
  assert.deepEqual(calls.update, [{ pageId: 1, title: '新标题' }]);
});

test('已合上或不存在的页边不应生成标题', async () => {
  let generated = 0;
  const service = new TitleService(
    createRepository(page({ status: 'closed' })).repository,
    generator(async () => {
      generated += 1;
      return '标题';
    }),
  );
  await service.run(1, () => {});

  const missing = new TitleService(
    {
      findById: () => null,
      updateTitle: () => null,
    },
    generator(async () => {
      generated += 1;
      return '标题';
    }),
  );
  await missing.run(2, () => {});

  assert.equal(generated, 0);
});

test('更新时页面已消失应放弃写入和广播', async () => {
  const { repository } = createRepository();
  const broken = {
    findById: () => page(),
    updateTitle: () => null,
  };
  const emitted = [];
  const service = new TitleService(
    broken,
    generator(async () => '标题'),
  );

  await service.run(1, (event) => emitted.push(event));

  assert.deepEqual(emitted, []);
  assert.equal(repository.findById(1).title, '注意力像带宽');
});

test('并发触发应复用进行中的任务并补跑一次', async () => {
  const { repository, calls } = createRepository();
  let attempts = 0;
  let release;
  const firstRun = new Promise((resolve) => {
    release = resolve;
  });
  const service = new TitleService(
    repository,
    generator(async () => {
      attempts += 1;
      return attempts === 1 ? firstRun : Promise.resolve('第二次标题');
    }),
  );

  const running = service.run(1, () => {});
  const queued = service.run(1, () => {});

  assert.equal(running, queued);
  release('第一次标题');
  await running;
  await flush();

  assert.equal(attempts, 2);
  assert.equal(calls.update.at(-1).title, '第二次标题');
});

test('无效页边编号应直接返回', async () => {
  let generated = 0;
  const service = new TitleService(
    createRepository().repository,
    generator(async () => {
      generated += 1;
      return '标题';
    }),
  );

  await service.run(0, () => {});
  await service.run(-1, () => {});

  assert.equal(generated, 0);
});

test('手动生成应写入并返回标题', async () => {
  const { repository, calls } = createRepository();
  const service = new TitleService(
    repository,
    generator(async () => '注意力像带宽'),
  );

  const result = await service.generate(1);

  assert.deepEqual(result, { ok: true, title: '注意力像带宽' });
  assert.deepEqual(calls.update, [{ pageId: 1, title: '注意力像带宽' }]);
});

test('手动生成重复点击可以生成不同标题', async () => {
  const { repository, calls } = createRepository();
  let attempt = 0;
  const service = new TitleService(
    repository,
    generator(async () => {
      attempt += 1;
      return attempt === 1 ? '第一版标题' : '第二版标题';
    }),
  );

  assert.equal((await service.generate(1)).title, '第一版标题');
  assert.equal((await service.generate(1)).title, '第二版标题');
  assert.deepEqual(
    calls.update.map((call) => call.title),
    ['第一版标题', '第二版标题'],
  );
});

test('手动生成失败应返回受控错误码', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { repository } = createRepository();
  const service = new TitleService(
    repository,
    generator(async () => {
      throw Object.assign(new Error('provider down'), {
        errorCode: 'PROVIDER_TIMEOUT',
      });
    }),
  );

  assert.deepEqual(await service.generate(1), {
    ok: false,
    errorCode: 'PROVIDER_TIMEOUT',
  });
});

test('手动生成遇到未知异常应返回统一错误码', async (t) => {
  t.mock.method(console, 'error', () => {});
  const service = new TitleService(
    createRepository().repository,
    generator(async () => {
      throw new Error('boom');
    }),
  );

  assert.deepEqual(await service.generate(1), {
    ok: false,
    errorCode: 'PROVIDER_REQUEST_FAILED',
  });
});

test('手动生成应处理页面不存在、正文为空和空标题', async () => {
  const missing = new TitleService(
    { findById: () => null, updateTitle: () => null },
    generator(async () => '标题'),
  );
  assert.deepEqual(await missing.generate(1), {
    ok: false,
    errorCode: 'PAGE_NOT_FOUND',
  });
  assert.deepEqual(await missing.generate(0), {
    ok: false,
    errorCode: 'INVALID_PAGE_ID',
  });

  const emptyBody = new TitleService(
    createRepository(page({ body: '   ' })).repository,
    generator(async () => '标题'),
  );
  assert.deepEqual(await emptyBody.generate(1), {
    ok: false,
    errorCode: 'INVALID_BODY',
  });

  const emptyTitle = new TitleService(
    createRepository().repository,
    generator(async () => '   '),
  );
  assert.deepEqual(await emptyTitle.generate(1), {
    ok: false,
    errorCode: 'PROVIDER_REQUEST_FAILED',
  });
});

test('手动生成期间正文变化应重算并采用新正文的标题', async () => {
  const initial = page();
  const { repository, calls, setPage } = createRepository(initial);
  let attempts = 0;
  const service = new TitleService(
    repository,
    generator(async () => {
      attempts += 1;

      if (attempts === 1) {
        setPage({ ...initial, body: '改过之后的正文。' });
        return '旧标题';
      }

      return '新标题';
    }),
  );

  const result = await service.generate(1);

  assert.equal(attempts, 2);
  assert.deepEqual(result, { ok: true, title: '新标题' });
  assert.deepEqual(calls.update, [{ pageId: 1, title: '新标题' }]);
});

test('手动生成写入失败应返回保存错误', async () => {
  const { repository } = createRepository();
  repository.updateTitle = () => null;
  const service = new TitleService(
    repository,
    generator(async () => '标题'),
  );

  assert.deepEqual(await service.generate(1), {
    ok: false,
    errorCode: 'SAVE_FAILED',
  });
});

test('手动重新生成应把当前标题作为需要避开的旧标题', async () => {
  const { repository } = createRepository(page({ title: '上一次的标题' }));
  const seen = [];
  const service = new TitleService(
    repository,
    generator(async (_body, options) => {
      seen.push(options);
      return '新的标题';
    }),
  );

  const result = await service.generate(1);

  assert.deepEqual(result, { ok: true, title: '新的标题' });
  assert.deepEqual(seen, [{ avoid: '上一次的标题' }]);
});

test('首屏标题还是截断文本时不应把截断文本当作旧标题', async () => {
  const body = '注意力是一种有限资源。';
  const { repository } = createRepository(
    page({ title: '注意力是一种有限资源。'.slice(0, 12), body }),
  );
  const seen = [];
  const service = new TitleService(
    repository,
    generator(async (_body, options) => {
      seen.push(options);
      return '注意力与带宽';
    }),
  );

  await service.generate(1);

  assert.deepEqual(seen, [{ avoid: undefined }]);
});

test('自动生成不应覆盖用户手动编辑过的标题', async () => {
  const { repository } = createRepository(
    page({ title: '我自己的标题', titleSource: 'user' }),
  );
  let generated = 0;
  const service = new TitleService(
    repository,
    generator(async () => {
      generated += 1;
      return '模型标题';
    }),
  );

  await service.run(1, () => {});

  assert.equal(generated, 0);
});

test('手动生成应覆盖用户标题并重新标记为模型标题', async () => {
  const { repository, calls } = createRepository(
    page({ title: '我自己的标题', titleSource: 'user' }),
  );
  const service = new TitleService(
    repository,
    generator(async () => '模型标题'),
  );

  const result = await service.generate(1);

  assert.deepEqual(result, { ok: true, title: '模型标题' });
  assert.deepEqual(calls.sources, ['model']);
});

test('自动生成成功后应把来源标记为模型标题', async () => {
  const { repository, calls } = createRepository();
  const service = new TitleService(
    repository,
    generator(async () => '模型标题'),
  );

  await service.run(1, () => {});

  assert.deepEqual(calls.sources, ['model']);
});
